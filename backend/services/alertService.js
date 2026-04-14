"use strict";

const Alert = require("../models/Alert");
const { emitSOCAlert } = require("./sseService");

/**
 * @param {object} opts
 * @param {number}  opts.userId
 * @param {number}  [opts.riskScore]
 * @param {string}  opts.reason       - Human-readable description shown in SOC
 * @param {string}  [opts.status]     - "OPEN" (default) | "RESOLVED"
 */
async function createAlert({ userId, riskScore = 0, reason, status = "OPEN" }) {
  try {
    const alert = await Alert.create({ userId, riskScore, reason, status });

    // [B1] Push to all connected SOC admin clients via SSE — zero latency
    emitSOCAlert({ id: alert.id, userId, riskScore, reason, status, createdAt: alert.createdAt });

    return alert;
  } catch (err) {
    // Alert creation must never crash a request
    console.error("[alertService] Failed to create alert:", err.message);
  }
}

module.exports = { createAlert };
