/**
 * logPurge.worker.js
 *
 * Runs daily at 02:00. Permanently deletes ActivityLog records older
 * than 12 months (GDPR / data-minimisation compliance).
 *
 * Why 12 months?
 *   - Sufficient for annual security audits and compliance reviews.
 *   - Prevents unbounded table growth over multi-year deployments.
 *   - The SOC export feature captures any records admins need to retain
 *     permanently before they are purged.
 *
 * Started once at server boot from server.js — no HTTP exposure.
 */

"use strict";

const cron        = require("node-cron");
const { Op }      = require("sequelize");
const ActivityLog = require("../models/ActivityLog");

// Runs every day at 02:00 local server time
cron.schedule("0 2 * * *", async () => {
  try {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 1); // exactly 12 months ago

    const deleted = await ActivityLog.destroy({
      where: { createdAt: { [Op.lt]: cutoff } }
    });

    if (deleted > 0) {
      console.log(`[CRON] Log purge: deleted ${deleted} ActivityLog record(s) older than 12 months.`);

      // Write a system-level audit entry so admins can see purges happened.
      // userId = null marks it as a system action (not tied to any user).
      ActivityLog.create({
        userId:    null,
        action:    "LOG_PURGE",
        resource:  `Auto-purged ${deleted} log record(s) older than 12 months (cutoff: ${cutoff.toISOString()})`,
        riskScore: 0,
        decision:  "ALLOW",
        status:    "RESOLVED",
        department: "SYSTEM"
      }).catch(() => {}); // fire-and-forget — purge itself must not fail on a log write error
    }
  } catch (err) {
    console.error("[CRON] logPurge error:", err.message);
  }
});

console.log("[CRON] Log purge worker started (runs daily at 02:00 — deletes logs older than 12 months)");
