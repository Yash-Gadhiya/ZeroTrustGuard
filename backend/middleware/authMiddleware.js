"use strict";

const jwt        = require("jsonwebtoken");
const User       = require("../models/User");
const blacklist  = require("../services/tokenBlacklist");

/**
 * verifyToken — Authentication Middleware
 *
 * Checks (in order):
 *  1. Authorization header present and well-formed
 *  2. JWT signature valid and not expired
 *  3. Token jti NOT in the revocation blacklist (logout / admin block)
 *  4. User account NOT blocked at the DB level (catches cases where block
 *     happened after token was issued but before blacklist entry was added)
 */
async function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    // SSE fallback: EventSource cannot set custom headers, so accept ?token= query param
    // This is intentional and safe — token is still validated fully below
    const queryToken = req.query.token;

    if (!authHeader && !queryToken) {
      return res.status(403).json({ message: "Access denied. No token provided." });
    }

    if (authHeader && !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Invalid authorization format" });
    }

    const token   = queryToken || authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // [H2] Check token revocation blacklist (logout / admin block)
    if (blacklist.has(decoded.jti)) {
      return res.status(401).json({ message: "Token has been revoked. Please log in again." });
    }

    // [H2] Live DB check — catches blocks that occurred after token was issued
    // Skip for temp MFA tokens (they only carry { id, mfaPending })
    if (!decoded.mfaPending) {
      const user = await User.findByPk(decoded.id, {
        attributes: ["id", "is_blocked", "block_reason"]
      });
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      if (user.is_blocked) {
        const messages = {
          FAILED_ATTEMPTS: "Account locked due to multiple failed attempts.",
          ADMIN_BLOCK:     "Account suspended by administrator."
        };
        return res.status(403).json({
          message: messages[user.block_reason] || "Account blocked."
        });
      }
    }

    req.user = decoded;
    next();

  } catch (error) {
    console.error("Token verification error:", error.message);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

module.exports = verifyToken;