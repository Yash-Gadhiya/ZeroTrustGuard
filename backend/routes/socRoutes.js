const express       = require("express");
const router        = express.Router();

const verifyToken   = require("../middleware/authMiddleware");
const requireRole   = require("../middleware/roleMiddleware");
const speakeasy     = require("speakeasy");
const blacklist     = require("../services/tokenBlacklist");
const { sendAccountSuspended } = require("../services/emailService");

const Alert         = require("../models/Alert");
const ActivityLog   = require("../models/ActivityLog");
const ActiveSession = require("../models/ActiveSession");
const User          = require("../models/User");
const { Op }        = require("sequelize");

// ── Legacy routes with safety caps ──────────────────────────────────────────
// Older endpoints kept for backwards compat; /api/activity-logs is preferred.
router.get("/alerts", verifyToken, requireRole("admin"), async (req, res) => {
  const alerts = await Alert.findAll({ order: [["createdAt", "DESC"]], limit: 500 });
  res.json(alerts);
});

router.get("/logs", verifyToken, requireRole("admin"), async (req, res) => {
  const logs = await ActivityLog.findAll({ order: [["createdAt", "DESC"]], limit: 500 });
  res.json(logs);
});

// ── Get All Users (Admin) ────────────────────────────────────────────────────
router.get("/users", verifyToken, requireRole("admin"), async (req, res) => {
  const users = await User.findAll({
    attributes: { exclude: ["password"] },
    order: [["createdAt", "DESC"]],
  });
  res.json(users);
});

// ── Toggle Block / Unblock ───────────────────────────────────────────────────
router.put("/users/:id/toggle-block", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // [H1] TOTP MFA check for admin actions
    const adminUser = await User.findByPk(req.user.id);
    if (adminUser && adminUser.mfaEnabled) {
      const mfaToken = req.headers["x-mfa-pin"];
      if (!mfaToken) return res.status(403).json({ mfaRequired: true, message: "Authenticator code required for admin actions." });
      const isValid = adminUser.mfaSecret && speakeasy.totp.verify({
        secret: adminUser.mfaSecret, encoding: "base32", token: mfaToken, window: 1
      });
      if (!isValid) return res.status(403).json({ mfaRequired: true, message: "Invalid or expired authenticator code." });
    }

    if (user.id === req.user.id) return res.status(400).json({ message: "You cannot block yourself" });

    if (user.is_blocked) {
      // Unblock
      user.is_blocked = false;
      user.block_reason = null;
      user.blocked_until = null;
      user.login_failed_attempts = 0;

      await ActivityLog.update(
        { status: "RESOLVED", resolved: true },
        { where: { userId: user.id, action: { [Op.in]: ["ADMIN_BLOCK", "ACCOUNT_LOCKOUT"] } } }
      );
      await Alert.update(
        { status: "RESOLVED" },
        { where: { userId: user.id, status: { [Op.ne]: "RESOLVED" } } }
      );
      await ActivityLog.create({
        userId: user.id, riskScore: 0, action: "ACCOUNT_UNBLOCK", status: "RESOLVED",
        department: user.department,
        resource: `User manually unblocked by SOC Admin (${req.user.email})`,
        ipAddress: req.ip, userAgent: req.headers["user-agent"]
      });
      await Alert.create({
        userId: user.id, riskScore: 0,
        reason: `User ${user.email} unblocked by Admin`, status: "RESOLVED"
      });
    } else {
      // Block
      user.is_blocked = true;
      user.block_reason = "ADMIN_BLOCK";
      user.blocked_until = null;

      await ActivityLog.create({
        userId: user.id, riskScore: 90, action: "ADMIN_BLOCK", status: "SUCCESS",
        department: user.department,
        resource: `User manually blocked by SOC Admin (${req.user.email})`,
        ipAddress: req.ip, userAgent: req.headers["user-agent"]
      });
      sendAccountSuspended(user.email).catch(() => {});
    }

    await user.save();

    // [H2] Instant JWT revocation on block — blacklist all active sessions immediately
    if (user.is_blocked) {
      const sessions = await ActiveSession.findAll({ where: { userId: user.id } });
      sessions.forEach(s => {
        if (s.jti) blacklist.add(s.jti, Math.floor(new Date(s.expiresAt).getTime() / 1000));
      });
      await ActiveSession.destroy({ where: { userId: user.id } });
    }

    res.json({
      message: user.is_blocked ? "User blocked successfully" : "User unblocked successfully",
      is_blocked: user.is_blocked
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Temporary Lockout (time-limited) ────────────────────────────────────────
router.post("/users/:id/lockout", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const { duration } = req.body;
    const DURATIONS = {
      "15m": 15 * 60 * 1000, "1h": 1 * 60 * 60 * 1000,
      "4h":  4 * 60 * 60 * 1000, "24h": 24 * 60 * 60 * 1000, "7d": 7 * 24 * 60 * 60 * 1000,
    };
    if (!DURATIONS[duration]) return res.status(400).json({ message: "Invalid lockout duration." });

    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found." });
    if (user.id === req.user.id) return res.status(400).json({ message: "You cannot lock yourself out." });

    const adminUser = await User.findByPk(req.user.id);
    if (adminUser && adminUser.mfaEnabled) {
      const mfaToken = req.headers["x-mfa-pin"];
      if (!mfaToken) return res.status(403).json({ mfaRequired: true, message: "Authenticator code required." });
      const isValid = adminUser.mfaSecret && speakeasy.totp.verify({
        secret: adminUser.mfaSecret, encoding: "base32", token: mfaToken, window: 1
      });
      if (!isValid) return res.status(403).json({ mfaRequired: true, message: "Invalid or expired code." });
    }

    const until = new Date(Date.now() + DURATIONS[duration]);
    user.blocked_until = until;
    user.block_reason  = "LOCKOUT";
    await user.save();

    await ActivityLog.create({
      userId: user.id, riskScore: 60, action: "ACCOUNT_LOCKOUT", status: "SUCCESS",
      department: user.department,
      resource: `Temp lockout by ${req.user.email} for ${duration} until ${until.toISOString()}`,
      ipAddress: req.ip, userAgent: req.headers["user-agent"]
    });

    sendAccountSuspended(user.email).catch(() => {});
    res.json({ message: `User locked out for ${duration}`, lockedUntil: until });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Remove lockout only ──────────────────────────────────────────────────────
router.post("/users/:id/unlock-lockout", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found." });

    const adminUser = await User.findByPk(req.user.id);
    if (adminUser && adminUser.mfaEnabled) {
      const mfaToken = req.headers["x-mfa-pin"];
      if (!mfaToken) return res.status(403).json({ mfaRequired: true, message: "Authenticator code required." });
      const isValid = adminUser.mfaSecret && speakeasy.totp.verify({
        secret: adminUser.mfaSecret, encoding: "base32", token: mfaToken, window: 1
      });
      if (!isValid) return res.status(403).json({ mfaRequired: true, message: "Invalid or expired code." });
    }

    user.blocked_until = null;
    if (user.block_reason === "LOCKOUT") user.block_reason = null;
    await user.save();

    await ActivityLog.create({
      userId: user.id, riskScore: 0, action: "ACCOUNT_UNBLOCK", status: "RESOLVED",
      department: user.department,
      resource: `Lockout cleared by ${req.user.email}`,
      ipAddress: req.ip, userAgent: req.headers["user-agent"]
    });

    res.json({ message: "Lockout removed. User can log in again." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
