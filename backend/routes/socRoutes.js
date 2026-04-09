const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");

const Alert = require("../models/Alert");
const ActivityLog = require("../models/ActivityLog");
const User = require("../models/User");
const bcrypt = require("bcrypt");
const { Op } = require("sequelize");


// ===============================
// Existing Routes
// ===============================

// Get all alerts (Admin only)
router.get("/alerts", verifyToken, requireRole("admin"), async (req, res) => {
  const alerts = await Alert.findAll({ order: [["createdAt", "DESC"]] });
  res.json(alerts);
});

// Get activity logs
router.get("/logs", verifyToken, requireRole("admin"), async (req, res) => {
  const logs = await ActivityLog.findAll({ order: [["createdAt", "DESC"]] });
  res.json(logs);
});


// ===============================
// NEW: Get All Users (Admin)
// ===============================
router.get("/users", verifyToken, requireRole("admin"), async (req, res) => {
  const users = await User.findAll({
    attributes: { exclude: ["password"] },
    order: [["createdAt", "DESC"]],
  });

  res.json(users);
});


// ===============================
// NEW: Toggle Block / Unblock
// ===============================
router.put("/users/:id/toggle-block", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check MFA
    const adminUser = await User.findByPk(req.user.id);
    if (adminUser && adminUser.mfaEnabled) {
      const mfaPin = req.headers["x-mfa-pin"];
      if (!mfaPin) return res.status(403).json({ mfaRequired: true, message: "MFA PIN required for admin actions." });
      const isValid = await bcrypt.compare(mfaPin, adminUser.mfaPin);
      if (!isValid) return res.status(403).json({ mfaRequired: true, message: "Invalid MFA PIN." });
    }

    // Prevent admin from blocking themselves (optional safety)
    if (user.id === req.user.id) {
      return res.status(400).json({ message: "You cannot block yourself" });
    }

    // If user is blocked → Unblock
    if (user.is_blocked) {
      user.is_blocked = false;
      user.block_reason = null;
      user.blocked_until = null;
      user.login_failed_attempts = 0;

      // Resolve previous block logs
      await ActivityLog.update(
        { status: "RESOLVED", resolved: true },
        { where: { userId: user.id, action: { [Op.in]: ["ADMIN_BLOCK", "ACCOUNT_LOCKOUT"] } } }
      );

      // Resolve in Alert table
      await Alert.update(
        { status: "RESOLVED" },
        { where: { userId: user.id, status: { [Op.ne]: "RESOLVED" } } }
      );

      // Log the unblock action for SOC Dashboard alerts
      await ActivityLog.create({
        userId: user.id,
        riskScore: 0, // Safe event
        action: "ACCOUNT_UNBLOCK",
        status: "RESOLVED",
        department: user.department,
        resource: `User manually unblocked by SOC Admin (${req.user.email})`,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"]
      });

      // Sync strictly with Alert model as requested
      await Alert.create({
        userId: user.id,
        riskScore: 0,
        reason: `User ${user.email} unblocked by Admin`,
        status: "RESOLVED"
      });
    } 
    // Else → Block manually
    else {
      user.is_blocked = true;
      user.block_reason = "ADMIN_BLOCK";
      user.blocked_until = null;

      // Log the action for SOC Dashboard alerts
      await ActivityLog.create({
        userId: user.id,
        riskScore: 90, // High Risk for Manual Admin Block
        action: "ADMIN_BLOCK",
        status: "SUCCESS",
        department: user.department,
        resource: `User manually blocked by SOC Admin (${req.user.email})`,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"]
      });
    }

    await user.save();

    res.json({
      message: user.is_blocked
        ? "User blocked successfully"
        : "User unblocked successfully",
      is_blocked: user.is_blocked
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


module.exports = router;