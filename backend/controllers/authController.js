const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const ActivityLog = require("../models/ActivityLog");
const Alert = require("../models/Alert");
const { Op } = require("sequelize");

// =======================
// REGISTER (FIXED)
// =======================
exports.register = async (req, res) => {
  try {
    const { name, email, password, role, department, designation, designation_level } = req.body;

    console.log("------------------------------------");
    console.log("INCOMING REGISTRATION:", email);
    console.log("------------------------------------");

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      name: name || null,
      email: email,
      password: hashedPassword,
      role: role,
      department: department,
      designation: designation,
      designation_level: Number(designation_level),
      login_failed_attempts: 0,
      is_blocked: false
    });

    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// =======================
// LOGIN
// =======================
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const now = new Date();

    // Check if user is currently blocked
    if (user.is_blocked) {
      if (
        user.block_reason === "FAILED_ATTEMPTS" &&
        user.blocked_until &&
        now > user.blocked_until
      ) {
        // Unblock user if time has passed
        user.is_blocked = false;
        user.login_failed_attempts = 0;
        user.blocked_until = null;
        user.block_reason = null;

        // Resolve previous block logs in ActivityLog
        await ActivityLog.update(
          { status: "RESOLVED", resolved: true },
          { where: { userId: user.id, action: { [Op.in]: ["ADMIN_BLOCK", "ACCOUNT_LOCKOUT"] } } }
        );

        // Resolve previous alerts in Alert table
        await Alert.update(
          { status: "RESOLVED" },
          { where: { userId: user.id, status: { [Op.ne]: "RESOLVED" } } }
        );

        await ActivityLog.create({
          userId: user.id,
          riskScore: 10,
          action: "ACCOUNT_UNBLOCK",
          status: "RESOLVED",
          department: user.department,
          resource: `System: Automatic 24-hour block expired for ${user.email}`,
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"]
        });

        // Sync strictly with Alert model as requested
        await Alert.create({
          userId: user.id,
          riskScore: 10,
          reason: `System: Automatic 24-hour block expired for ${user.email}`,
          status: "RESOLVED"
        });

        await user.save();
      } else {
        const blockMessages = {
          FAILED_ATTEMPTS: "Security Lock: Multiple failed attempts. Account isolated for 24 hours. Contact Admin for assistance.",
          ADMIN_BLOCK: "Access Denied: Account suspended by SOC Administrator. Contact Admin for details."
        };
        return res.status(403).json({ 
          message: blockMessages[user.block_reason] || "Zero Trust Violation: Account Blocked." 
        });
      }
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      user.login_failed_attempts += 1;
      
      // TRIGGER SECURITY ALERT ON BLOCK
      if (user.login_failed_attempts >= 5) {
        user.is_blocked = true;
        user.blocked_until = new Date(Date.now() + 24 * 60 * 60 * 1000);
        user.block_reason = "FAILED_ATTEMPTS";

        // CREATE ACTIVITY LOG ENTRY FOR SOC DASHBOARD ALERTS
        await ActivityLog.create({
          userId: user.id,
          riskScore: 95, // High Risk for Brute Force
          action: "ACCOUNT_LOCKOUT",
          status: "FAILED",
          department: user.department,
          resource: `Brute force detected: 5 failed attempts for ${user.email}`,
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"]
        });
        
        // Also keep the Alert model update if needed, but the priority is ActivityLog for high risk scores
        await Alert.create({
          userId: user.id,
          riskScore: 95,
          reason: `Brute force detected: 5 failed attempts for ${user.email}`,
          status: "OPEN"
        });
        
        console.log(`[SECURITY ALERT] User ${user.email} blocked and alert created.`);
      }
      
      await user.save();
      return res.status(401).json({
        message: "Invalid credentials",
        failed_attempts: user.login_failed_attempts
      });
    }

    // Reset attempts on successful login
    user.login_failed_attempts = 0;
    await user.save();

    if (user.mfaEnabled) {
      const tempToken = jwt.sign(
        { id: user.id, mfaPending: true },
        process.env.JWT_SECRET,
        { expiresIn: "5m" }
      );
      return res.json({ mfaRequired: true, tempToken });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    return res.json({
      message: "Login successful",
      token,
      role: user.role
    });

  } catch (error) {
    console.error("LOGIN ERROR:", error);
    return res.status(500).json({ error: "Internal Server Error during authentication" });
  }
};

// =======================
// USER PROFILE
// =======================
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ["id", "email", "role", "department", "designation", "designation_level", "is_blocked"]
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};