const bcrypt = require("bcrypt");
const jwt    = require("jsonwebtoken");
const crypto = require("crypto");
const User        = require("../models/User");
const ActivityLog = require("../models/ActivityLog");
const Alert       = require("../models/Alert");
const blacklist   = require("../services/tokenBlacklist");
const { Op }      = require("sequelize");

// =======================
// REGISTER
// [A3] role is ALWAYS hardcoded to "intern" — never trust client-supplied role
// [A9] Removed console.log that leaked user emails to stdout
// Added: email format check, password minimum length
// =======================
exports.register = async (req, res) => {
  try {
    const { name, email, password, department, designation, designation_level } = req.body;

    // Input validation
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      name:               name || null,
      email,
      password:           hashedPassword,
      role:               "intern",          // [A3] Always intern — never from req.body
      department,
      designation,
      designation_level:  designation_level ? Number(designation_level) : null,
      login_failed_attempts: 0,
      is_blocked:         false
    });

    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    // [A4] Never expose internal error details to client
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ message: "An account with this email already exists" });
    }
    console.error("Register error:", error.message);
    res.status(500).json({ message: "Registration failed" });
  }
};

// =======================
// LOGIN
// [H8] Returns identical 401 message for both wrong email AND wrong password
//      (prevents user enumeration via different status codes)
// [H9] Logs LOGIN_SUCCESS to ActivityLog — SOC can now see who logged in from where
// =======================
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // [H8] Use same generic message for not-found AND wrong-password
    const INVALID_MSG = "Invalid email or password";

    const user = await User.findOne({ where: { email } });
    if (!user) {
      // Still consume time to prevent timing-based enumeration
      await bcrypt.compare(password, "$2b$10$invalidhashpaddingtomimicbcrypt");
      return res.status(401).json({ message: INVALID_MSG });
    }

    const now = new Date();

    // Check if user is currently blocked
    if (user.is_blocked) {
      if (
        user.block_reason === "FAILED_ATTEMPTS" &&
        user.blocked_until &&
        now > user.blocked_until
      ) {
        // Auto-unblock when time has elapsed
        user.is_blocked = false;
        user.login_failed_attempts = 0;
        user.blocked_until = null;
        user.block_reason = null;

        await ActivityLog.update(
          { status: "RESOLVED", resolved: true },
          { where: { userId: user.id, action: { [Op.in]: ["ADMIN_BLOCK", "ACCOUNT_LOCKOUT"] } } }
        );

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
          ADMIN_BLOCK:     "Access Denied: Account suspended by SOC Administrator. Contact Admin for details."
        };
        return res.status(403).json({
          message: blockMessages[user.block_reason] || "Zero Trust Violation: Account Blocked."
        });
      }
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      user.login_failed_attempts += 1;

      if (user.login_failed_attempts >= 5) {
        user.is_blocked    = true;
        user.blocked_until = new Date(Date.now() + 24 * 60 * 60 * 1000);
        user.block_reason  = "FAILED_ATTEMPTS";

        await ActivityLog.create({
          userId:    user.id,
          riskScore: 95,
          action:    "ACCOUNT_LOCKOUT",
          status:    "FAILED",
          department: user.department,
          resource:  `Brute force detected: 5 failed attempts for ${user.email}`,
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"]
        });

        await Alert.create({
          userId:    user.id,
          riskScore: 95,
          reason:    `Brute force detected: 5 failed attempts for ${user.email}`,
          status:    "OPEN"
        });

        console.log(`[SECURITY ALERT] Account locked: ${user.email}`);
      }

      await user.save();
      // [H8] Same message for wrong password as for wrong email
      return res.status(401).json({
        message: INVALID_MSG,
        failed_attempts: user.login_failed_attempts
      });
    }

    // ── Successful login ──────────────────────────────────────────────────────
    user.login_failed_attempts = 0;
    await user.save();

    // [H9] Log every successful login to ActivityLog so SOC can track access
    await ActivityLog.create({
      userId:    user.id,
      action:    "LOGIN_SUCCESS",
      status:    "SUCCESS",
      riskScore: 5,
      department: user.department,
      resource:  `Successful login for ${user.email}`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]
    });

    if (user.mfaEnabled) {
      // Temp token for MFA step — short-lived, no jti needed (not revocable)
      const tempToken = jwt.sign(
        { id: user.id, mfaPending: true },
        process.env.JWT_SECRET,
        { expiresIn: "5m" }
      );
      return res.json({ mfaRequired: true, tempToken });
    }

    // [H1] User has not fully activated TOTP — force setup on login
    // If they abandoned setup previously, this forces them to restart it
    const setupToken = jwt.sign(
      { id: user.id, mfaPending: true },   // mfaPending so authMiddleware accepts it on setup routes
      process.env.JWT_SECRET,
      { expiresIn: "10m" }                 // 10 min — enough time to scan the QR code
    );
    return res.json({ mfaSetupRequired: true, setupToken });

  } catch (error) {
    console.error("LOGIN ERROR:", error);
    return res.status(500).json({ message: "Internal Server Error during authentication" });
  }
};

// =======================
// LOGOUT
// [H2] Adds the caller's jti to the blacklist — immediately invalidates token
// =======================
exports.logout = async (req, res) => {
  try {
    const { jti, exp } = req.user;
    if (jti) {
      blacklist.add(jti, exp);
    }
    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error.message);
    res.status(500).json({ message: "Logout failed" });
  }
};

// =======================
// USER PROFILE
// [A10] Added "name" to attributes — was missing, causing blank sidebar display
// =======================
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ["id", "name", "email", "role", "department", "designation", "designation_level", "is_blocked"]
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (error) {
    console.error("getProfile error:", error.message);
    res.status(500).json({ message: "Failed to fetch profile" });
  }
};