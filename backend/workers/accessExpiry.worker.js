/**
 * accessExpiry.worker.js
 *
 * Runs every 60 seconds. Finds all TemporaryAccess rows where expiresAt has
 * passed, destroys them, and logs the revocation to ActivityLog.
 *
 * Started once at server boot from server.js — no HTTP exposure.
 */

"use strict";

const cron        = require("node-cron");
const { Op }      = require("sequelize");
const TemporaryAccess = require("../models/TemporaryAccess");
const ActivityLog     = require("../models/ActivityLog");
const { sendAccessExpired } = require("../services/emailService");
const User = require("../models/User");

cron.schedule("* * * * *", async () => {
  try {
    const expired = await TemporaryAccess.findAll({
      where: { expiresAt: { [Op.lt]: new Date() } },
      include: [{ model: User, attributes: ["id", "email", "department"] }]
    });

    if (expired.length === 0) return;

    for (const record of expired) {
      // Log the auto-revocation
      await ActivityLog.create({
        userId:    record.userId,
        action:    "TEMP_ACCESS_EXPIRED",
        fileId:    record.fileId,
        department: record.User?.department || null,
        resource:  `Temporary access to file #${record.fileId} automatically revoked (expired)`,
        riskScore: 0,
        decision:  "ALLOW",
        status:    "RESOLVED"
      });

      // Optional: notify user their access has expired
      if (record.User?.email) {
        sendAccessExpired(record.User.email, record.fileId).catch(() => {});
      }

      await record.destroy();
    }

    console.log(`[CRON] Revoked ${expired.length} expired TemporaryAccess record(s)`);
  } catch (err) {
    console.error("[CRON] accessExpiry error:", err.message);
  }
});

console.log("[CRON] Temporary access expiry worker started (runs every 60s)");
