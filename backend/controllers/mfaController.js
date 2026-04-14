"use strict";

/**
 * MFA Controller — TOTP (Time-Based One-Time Password)
 *
 * [H1] Replaced the weak 4-digit PIN system with TOTP compatible with
 *      Google Authenticator, Authy, and any RFC 6238 authenticator app.
 *
 * Flow:
 *  1. User hits POST /api/mfa/setup     → server generates base32 secret + QR code
 *  2. User scans QR with Authenticator  → app starts generating 6-digit codes every 30s
 *  3. User submits first code to confirm enrollment (POST /api/mfa/verify with confirmSetup=true)
 *  4. On subsequent logins: POST /api/mfa/verify with token from Authenticator app
 */

const speakeasy = require("speakeasy");
const qrcode    = require("qrcode");
const crypto    = require("crypto");
const jwt       = require("jsonwebtoken");
const { Op }    = require("sequelize");
const User             = require("../models/User");
const MfaChangeRequest = require("../models/MfaChangeRequest");

// ── Setup: Generate TOTP secret + QR code ────────────────────────────────────
exports.setupTotp = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Generate a new base32 secret tied to this account
    const secret = speakeasy.generateSecret({
      name:   `ZeroTrustGuard (${user.email})`,
      issuer: "ZeroTrustGuard",
      length: 20
    });

    // Store secret temporarily in DB — not yet "enabled" until user confirms first code
    // Re-calling setup overwrites any previous un-confirmed secret (safe)
    user.mfaSecret  = secret.base32;
    user.mfaEnabled = false;  // stays false until first code confirmed
    await user.save();

    // Generate QR code as a data URI for the frontend to display
    const qrDataUrl = await qrcode.toDataURL(secret.otpauth_url);

    res.status(200).json({
      message:      "Scan the QR code with your authenticator app, then confirm with your first code.",
      qrCode:       qrDataUrl,
      backupCode:   secret.base32,   // shown once for manual entry if QR scan fails
      secretLength: secret.base32.length
    });
  } catch (error) {
    console.error("TOTP setup error:", error.message);
    res.status(500).json({ message: "Failed to setup TOTP" });
  }
};

// ── Verify: Validate 6-digit TOTP token ──────────────────────────────────────
// Used for two purposes (discriminated by `confirmSetup` flag in body):
//   • confirmSetup: true  → first-time enrollment confirmation (enables MFA)
//   • confirmSetup: false → standard MFA step during login
exports.verifyTotp = async (req, res) => {
  try {
    const { token, confirmSetup } = req.body;

    if (!token || !/^\d{6}$/.test(token)) {
      return res.status(400).json({ message: "A valid 6-digit code is required" });
    }

    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Check MFA lockout
    const now = new Date();
    if (user.mfaLockUntil && user.mfaLockUntil > now) {
      return res.status(403).json({
        message: "MFA locked due to too many failed attempts. Try again later."
      });
    }

    if (!user.mfaSecret) {
      return res.status(400).json({ message: "MFA not set up. Please call /api/mfa/setup first." });
    }

    // Verify with ±1 window tolerance (accepts codes up to 30s before/after)
    const isValid = speakeasy.totp.verify({
      secret:   user.mfaSecret,
      encoding: "base32",
      token,
      window:   1
    });

    if (!isValid) {
      user.mfaFailedAttempts += 1;
      if (user.mfaFailedAttempts >= 5) {
        user.mfaLockUntil = new Date(now.getTime() + 5 * 60 * 1000); // 5 min lockout
      }
      await user.save();
      return res.status(401).json({
        message: "Invalid or expired code. Codes are valid for 90 seconds."
      });
    }

    // ── Valid code ────────────────────────────────────────────────────────────
    user.mfaFailedAttempts = 0;
    user.mfaLockUntil      = null;

    if (confirmSetup) {
      // First-time enrollment — activate MFA
      user.mfaEnabled = true;
      await user.save();
      // Generate full JWT to log the user in immediately after setup
      const jti   = crypto.randomUUID();
      const fullToken = jwt.sign(
        { id: user.id, role: user.role, jti },
        process.env.JWT_SECRET,
        { expiresIn: "2h" }
      );
      return res.status(200).json({ 
        message: "MFA activated successfully. Your account is now protected.",
        token: fullToken,
        role: user.role
      });
    }

    await user.save();

    // Login completion — issue full JWT
    if (req.user.mfaPending) {
      const jti   = crypto.randomUUID();
      const fullToken = jwt.sign(
        { id: user.id, role: user.role, jti },
        process.env.JWT_SECRET,
        { expiresIn: "2h" }
      );
      return res.status(200).json({
        message: "Verification successful",
        token:   fullToken,
        role:    user.role
      });
    }

    res.status(200).json({ message: "Code verified" });

  } catch (error) {
    console.error("TOTP verify error:", error.message);
    res.status(500).json({ message: "Failed to verify code" });
  }
};

// ── Admin: Approve MFA reset request ─────────────────────────────────────────
exports.requestChange = async (req, res) => {
  try {
    const userId  = req.user.id;
    const { reason } = req.body;
    
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Automatically approve Admin reset requests without putting them in queue
    if (user.role === "admin" || user.role === "super_admin") {
      user.mfaSecret = null;
      user.mfaEnabled = false;
      await user.save();
      return res.status(200).json({ message: "Admin MFA reset activated automatically. You must log in again to set up the new authenticator.", bypass: true });
    }

    const existing = await MfaChangeRequest.findOne({ where: { userId, status: "pending" } });
    if (existing) {
      return res.status(400).json({ message: "A reset request is already pending. Please wait for admin approval." });
    }
    
    await MfaChangeRequest.create({ userId, status: "pending", reason: reason || "" });
    res.status(201).json({ message: "MFA reset request submitted to admin. You will be able to set up a new authenticator once approved." });
  } catch (error) {
    console.error("Request change error:", error.message);
    res.status(500).json({ message: "Failed to request MFA reset" });
  }
};

exports.approveChange = async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ message: "Admins only" });
    }
    const request = await MfaChangeRequest.findByPk(req.params.id);
    if (!request) return res.status(404).json({ message: "Request not found" });

    request.status     = "approved";
    request.approvedBy = req.user.id;
    await request.save();

    // Reset the user's TOTP secret — they must re-enroll
    const user = await User.findByPk(request.userId);
    if (user) {
      user.mfaSecret  = null;
      user.mfaEnabled = false;
      await user.save();
    }

    res.status(200).json({ message: "MFA reset approved. User must re-enroll." });
  } catch (error) {
    console.error("Approve change error:", error.message);
    res.status(500).json({ message: "Failed to approve request" });
  }
};

exports.rejectChange = async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ message: "Admins only" });
    }
    const request = await MfaChangeRequest.findByPk(req.params.id);
    if (!request) return res.status(404).json({ message: "Request not found" });

    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: "Rejection reason is required." });
    }

    request.status       = "rejected";
    request.approvedBy   = req.user.id;
    request.adminMessage = reason.trim();
    await request.save();

    res.status(200).json({ message: "Request rejected." });
  } catch (error) {
    console.error("Reject change error:", error.message);
    res.status(500).json({ message: "Failed to reject request" });
  }
};

exports.getPendingRequests = async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ message: "Admins only" });
    }
    const requests = await MfaChangeRequest.findAll({
      where:   { status: "pending" },
      include: [{ model: User, attributes: ["id", "email", "name", "department"] }],
      order:   [["createdAt", "DESC"]]
    });
    res.status(200).json(requests);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch requests" });
  }
};

exports.getMyRequests = async (req, res) => {
  try {
    const userId = req.user.id;
    const requests = await MfaChangeRequest.findAll({
      where: { userId },
      order: [["createdAt", "DESC"]]
    });
    res.status(200).json(requests);
  } catch (error) {
    console.error("Get my requests error:", error.message);
    res.status(500).json({ message: "Failed to fetch your requests" });
  }
};
