/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ZeroTrustGuard — Risk Engine v2
 *  Zero Trust principle: Never trust, always verify. Every action is scored.
 *
 *  7 independent signals → weighted composite score (0–100):
 *
 *  Signal                  Weight   What it detects
 *  ──────────────────────  ──────   ──────────────────────────────────────────
 *  Sensitivity mismatch    22%      Resource classification vs user clearance
 *  Temporal anomaly        18%      Gradient deviation from normal work hours
 *  IP anomaly              18%      New/unseen IP vs user's historical IPs
 *  Velocity anomaly        14%      Sudden spike in action rate (last 5 min)
 *  Department mismatch     11%      Cross-department resource access
 *  Recent auth failures     7%      Failed logins / MFA failures in last 30 min
 *  Geo anomaly             10%      Login from a new/unusual country
 *
 *  Decision thresholds:
 *    0–29   → ALLOW
 *    30–64  → MFA_REQUIRED
 *    65–84  → REVIEW          (new — SOC alert but not auto-block)
 *    85–100 → BLOCK
 * ═══════════════════════════════════════════════════════════════════════════
 */

"use strict";

const { Op }      = require("sequelize");
const ActivityLog = require("../models/ActivityLog");
const User        = require("../models/User");
const geoip       = require("geoip-lite"); // [C1] Geolocation anomaly signal

// ─── Weights (must sum to 1.0) ────────────────────────────────────────────────
const W = {
  sensitivityMismatch: 0.22,
  temporalAnomaly:     0.18,
  ipAnomaly:           0.18,
  velocityAnomaly:     0.14,
  departmentMismatch:  0.11,
  recentFailures:      0.07,
  geoAnomaly:          0.10,  // [C1] new signal
};

// ─── Role clearance levels ────────────────────────────────────────────────────
const ROLE_CLEARANCE = {
  intern:      1,
  staff:       2,
  senior:      3,
  admin:       4,
  super_admin: 5,
};

// ─── Minimum clearance required per sensitivity level ─────────────────────────
const SENSITIVITY_CLEARANCE = {
  low:      1,   // anyone
  high:     2,   // staff and above
  critical: 3,   // senior and above
};

// ─── Raw sensitivity base scores ──────────────────────────────────────────────
const SENSITIVITY_BASE = { low: 10, high: 55, critical: 90 };

// ─── Action risk weights (higher = riskier by nature) ─────────────────────────
const ACTION_WEIGHT = {
  file_download:   1.0,
  file_view:       0.6,
  access_request:  0.7,
  access_granted:  0.5,
  file_upload:     0.4,
  login:           0.3,
};

// ─────────────────────────────────────────────────────────────────────────────
// Signal 1 — Sensitivity × Role Mismatch
//
// Combines the raw sensitivity of the resource with how far below the
// required clearance the user is. An intern touching a critical file
// scores much higher than a senior doing the same.
// ─────────────────────────────────────────────────────────────────────────────
function scoreSensitivityMismatch(sensitivityLevel, userRole, action) {
  const base       = SENSITIVITY_BASE[sensitivityLevel] ?? 10;
  const clearance  = ROLE_CLEARANCE[userRole] ?? 1;
  const required   = SENSITIVITY_CLEARANCE[sensitivityLevel] ?? 1;
  const actionMult = ACTION_WEIGHT[action] ?? 0.5;

  // Clearance deficit: 0 = meets requirement, positive = below requirement
  const deficit = Math.max(0, required - clearance);

  // Boost base score by 20 points per clearance level of deficit
  const score = Math.min(100, (base + deficit * 20) * actionMult);
  return Math.round(score);
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal 2 — Temporal Anomaly (gradient, not binary)
//
// Models a "normal workday" as a smooth curve centred on 09:00–18:00.
// Uses a cosine-based falloff so that 8:50am ≈ safe, 2:00am ≈ very suspicious.
// Day-of-week is also factored — weekends carry a baseline uplift.
// ─────────────────────────────────────────────────────────────────────────────
function scoreTemporalAnomaly() {
  const now     = new Date();
  const hour    = now.getHours() + now.getMinutes() / 60; // fractional hours
  const dayOfWk = now.getDay(); // 0 = Sunday, 6 = Saturday

  // Core work window: 08:00–19:00
  // Score = 0 inside window, rises smoothly toward edges
  let timeScore;
  const WORK_START = 8;
  const WORK_END   = 19;

  if (hour >= WORK_START && hour <= WORK_END) {
    // Inside work hours — low base risk, slight early/late uplift
    const midpoint  = (WORK_START + WORK_END) / 2;     // 13.5
    const halfRange = (WORK_END - WORK_START) / 2;     // 5.5
    const deviation = Math.abs(hour - midpoint) / halfRange; // 0 at noon, 1 at edges
    timeScore = Math.round(10 + deviation * 15);         // 10–25
  } else {
    // Outside work hours — cosine ramp from edge to 3am (worst)
    const distFromEdge = hour < WORK_START
      ? WORK_START - hour           // e.g. 7 → 1, 3 → 5
      : hour - WORK_END;            // e.g. 20 → 1, 23 → 4
    // Worst at 3 hours outside the window (~3am or ~10pm+)
    const normalised = Math.min(distFromEdge / 5, 1);   // 0–1
    timeScore = Math.round(30 + normalised * 65);        // 30–95
  }

  // Weekend uplift: +15 (unusual to access on Sat/Sun)
  const weekendUplift = (dayOfWk === 0 || dayOfWk === 6) ? 15 : 0;

  return Math.min(100, timeScore + weekendUplift);
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal 3 — IP Anomaly
//
// Compares the current request IP against the last 20 distinct IPs this user
// has successfully used. First-time IPs are suspicious; completely new IPs
// with no history score highest.
// ─────────────────────────────────────────────────────────────────────────────
async function scoreIpAnomaly(userId, currentIp) {
  if (!currentIp) return 30; // no IP info = mild suspicion

  try {
    // Normalise IPv6-mapped IPv4 (::ffff:127.0.0.1 → 127.0.0.1)
    const normIp = currentIp.replace(/^::ffff:/, "");

    // Localhost / internal IPs are always trusted
    if (normIp === "127.0.0.1" || normIp === "::1" || normIp.startsWith("192.168.")) {
      return 0;
    }

    const recent = await ActivityLog.findAll({
      where:      { userId, ipAddress: { [Op.ne]: null } },
      attributes: ["ipAddress"],
      order:      [["createdAt", "DESC"]],
      limit:      50,
    });

    const knownIps = new Set(
      recent.map(r => (r.ipAddress || "").replace(/^::ffff:/, ""))
    );

    if (knownIps.size === 0) return 20;        // new account, no history
    if (knownIps.has(normIp)) return 0;        // known IP → no anomaly

    // Unknown IP — score based on how many unique IPs the user normally uses.
    // If this user typically uses 1 IP, a new one is very suspicious.
    // If they roam a lot (>5 IPs), a new one is less surprising.
    const diversityFactor = Math.min(knownIps.size / 5, 1); // 0–1
    return Math.round(80 - diversityFactor * 40);            // 40–80
  } catch {
    return 20;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal 4 — Velocity Anomaly
//
// Two-window approach:
//   • Short window (5 min):  detects sudden bursts (automation, exfil)
//   • Medium window (1 hr):  detects sustained elevated activity
//
// Compares the user's current 5-min rate to their personal 7-day baseline.
// A spike vs baseline is more meaningful than a raw threshold.
// ─────────────────────────────────────────────────────────────────────────────
async function scoreVelocityAnomaly(userId) {
  try {
    const now         = Date.now();
    const fiveMinAgo  = new Date(now - 5  * 60 * 1000);
    const oneHourAgo  = new Date(now - 60 * 60 * 1000);
    const sevenDaysAgo= new Date(now - 7 * 24 * 60 * 60 * 1000);

    const [burstCount, hourCount, weekCount] = await Promise.all([
      ActivityLog.count({ where: { userId, createdAt: { [Op.gte]: fiveMinAgo   } } }),
      ActivityLog.count({ where: { userId, createdAt: { [Op.gte]: oneHourAgo   } } }),
      ActivityLog.count({ where: { userId, createdAt: { [Op.gte]: sevenDaysAgo } } }),
    ]);

    // Personal baseline: average actions per hour over past 7 days
    const avgPerHour = weekCount / (7 * 24) || 1;

    // Burst ratio: how many times faster than baseline is the current rate?
    // 1 burst action per 5 min = 12/hr  → ratio = 12 / avgPerHour
    const burstRate  = (burstCount / 5) * 60;         // actions/hr equivalent
    const burstRatio = burstRate / avgPerHour;

    // Hour ratio
    const hourRatio = hourCount / avgPerHour;

    // Scoring: ratios above 3× baseline start scoring significantly
    let score = 0;
    if (burstRatio > 10) score = Math.max(score, 90); // extreme burst
    else if (burstRatio > 5)  score = Math.max(score, 70);
    else if (burstRatio > 3)  score = Math.max(score, 50);
    else if (burstRatio > 1.5)score = Math.max(score, 25);

    if (hourRatio > 5)  score = Math.max(score, 60);
    else if (hourRatio > 3) score = Math.max(score, 35);

    // Absolute safety nets (regardless of baseline) — brute raw counts
    if (burstCount > 15) score = Math.max(score, 85);
    if (hourCount  > 30) score = Math.max(score, 65);

    return Math.min(100, score);
  } catch {
    return 10;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal 5 — Department Mismatch
//
// In a Zero Trust environment, accessing resources from another department
// is always elevated risk — even if the file's allowedRoles permits it.
// The mismatching factor scales with file sensitivity.
// ─────────────────────────────────────────────────────────────────────────────
function scoreDepartmentMismatch(userDept, fileDept, sensitivityLevel) {
  // No mismatch data available → neutral
  if (!userDept || !fileDept) return 15;

  // Admin/all-department files have no mismatch concept
  if (fileDept === "All Departments" || fileDept === null) return 0;

  // Handle array of target departments
  const depts = Array.isArray(fileDept) ? fileDept : [fileDept];
  if (depts.includes("All Departments") || depts.includes(userDept)) return 0;

  // Cross-department — scale by sensitivity
  const sensitivityMultiplier = { low: 0.5, high: 0.8, critical: 1.0 };
  const base = 60;
  return Math.round(base * (sensitivityMultiplier[sensitivityLevel] ?? 0.5));
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal 6 — Recent Auth Failures
//
// Pulls the user's own failure record from the DB and checks recent
// MFA failures from ActivityLog. A user who just failed 3 MFA attempts
// and is now trying to download a file is very suspicious.
// ─────────────────────────────────────────────────────────────────────────────
async function scoreRecentFailures(userId) {
  try {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);

    const [user, recentFailures] = await Promise.all([
      User.findByPk(userId, { attributes: ["login_failed_attempts", "mfaFailedAttempts"] }),
      ActivityLog.count({
        where: {
          userId,
          status:    "FAILED",
          createdAt: { [Op.gte]: thirtyMinAgo }
        }
      })
    ]);

    const loginFails = user?.login_failed_attempts ?? 0;
    const mfaFails   = user?.mfaFailedAttempts     ?? 0;

    let score = 0;

    // Login failures (live counter from Users table)
    if (loginFails >= 4) score = Math.max(score, 80);
    else if (loginFails >= 2) score = Math.max(score, 45);
    else if (loginFails >= 1) score = Math.max(score, 20);

    // MFA failures
    if (mfaFails >= 3) score = Math.max(score, 75);
    else if (mfaFails >= 1) score = Math.max(score, 35);

    // Recent FAILED entries in ActivityLog (login attempts, scan failures, etc.)
    if (recentFailures >= 5) score = Math.max(score, 70);
    else if (recentFailures >= 2) score = Math.max(score, 40);

    return Math.min(100, score);
  } catch {
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal 7 — Geolocation Anomaly [C1]
//
// Looks up the country from the request IP using geoip-lite (offline DB,
// no external API calls). Compares against the user's last 10 login countries.
// A brand-new country scores high; a familiar country scores zero.
// Localhost / private IPs are treated as safe (score 0).
// ─────────────────────────────────────────────────────────────────────────────
async function scoreGeoAnomaly(userId, ipAddress) {
  if (!ipAddress) return 0;

  // Private/loopback IPs — always safe
  if (
    ipAddress === "127.0.0.1" ||
    ipAddress === "::1" ||
    ipAddress.startsWith("192.168.") ||
    ipAddress.startsWith("10.") ||
    ipAddress.startsWith("172.")
  ) return 0;

  const geo = geoip.lookup(ipAddress);
  if (!geo?.country) return 0; // IP not in database — no penalty

  const currentCountry = geo.country; // ISO 3166-1 alpha-2 (e.g. "IN", "US")

  try {
    // Get the last 10 distinct countries this user has been seen from
    const recentLogs = await ActivityLog.findAll({
      where:      { userId, ipAddress: { [Op.ne]: null } },
      order:      [["createdAt", "DESC"]],
      limit:      50,
      attributes: ["ipAddress"],
    });

    const knownCountries = new Set(
      recentLogs
        .map(l => {
          const g = geoip.lookup(l.ipAddress);
          return g?.country || null;
        })
        .filter(Boolean)
    );

    // Not enough history — don't penalise but note it
    if (knownCountries.size === 0) return 0;

    if (knownCountries.has(currentCountry)) return 0;  // Known country — safe

    // Brand new country — high anomaly
    console.log(`[RISK] Geo anomaly: user ${userId} logging in from new country ${currentCountry} (known: ${[...knownCountries].join(", ")})`);
    return 80;
  } catch {
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core scoring combiner
// ─────────────────────────────────────────────────────────────────────────────
function combineScores(signals) {
  const raw =
    signals.sensitivityMismatch * W.sensitivityMismatch +
    signals.temporalAnomaly     * W.temporalAnomaly     +
    signals.ipAnomaly           * W.ipAnomaly           +
    signals.velocityAnomaly     * W.velocityAnomaly     +
    signals.departmentMismatch  * W.departmentMismatch  +
    signals.recentFailures      * W.recentFailures      +
    signals.geoAnomaly          * W.geoAnomaly;          // [C1]

  return Math.min(100, Math.round(raw));
}

// ─────────────────────────────────────────────────────────────────────────────
// Decision engine — 4 tiers
// ─────────────────────────────────────────────────────────────────────────────
function riskDecision(riskScore) {
  if (riskScore < 30)  return "ALLOW";
  if (riskScore < 65)  return "MFA_REQUIRED";
  if (riskScore < 85)  return "REVIEW";        // SOC alert, not auto-blocked
  return "BLOCK";
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — computeRisk()
//
// Controllers call this with all available context. Returns:
//   { riskScore, decision, signals }
//
// `signals` is included so SOC dashboard can explain WHY the score is high.
// ─────────────────────────────────────────────────────────────────────────────
async function computeRisk({
  userId,
  action,
  sensitivityLevel = "low",
  userRole         = "intern",
  userDepartment   = null,
  fileDepartment   = null,
  ipAddress        = null,
}) {
  // Run all async signals in parallel for efficiency
  const [ipScore, velocityScore, failureScore, geoScore] = await Promise.all([
    scoreIpAnomaly(userId, ipAddress),
    scoreVelocityAnomaly(userId),
    scoreRecentFailures(userId),
    scoreGeoAnomaly(userId, ipAddress),   // [C1] new signal
  ]);

  const signals = {
    sensitivityMismatch: scoreSensitivityMismatch(sensitivityLevel, userRole, action),
    temporalAnomaly:     scoreTemporalAnomaly(),
    ipAnomaly:           ipScore,
    velocityAnomaly:     velocityScore,
    departmentMismatch:  scoreDepartmentMismatch(userDepartment, fileDepartment, sensitivityLevel),
    recentFailures:      failureScore,
    geoAnomaly:          geoScore,         // [C1]
  };

  const riskScore = combineScores(signals);
  const decision  = riskDecision(riskScore);

  return { riskScore, decision, signals };
}

// Legacy shim — keeps old calculateRisk() call signature compatible
function calculateRisk({ sensitivity, anomalyScore, frequency, context }) {
  return Math.min(100, Math.round(
    sensitivity  * 0.3 +
    anomalyScore * 0.4 +
    frequency    * 0.2 +
    context      * 0.1
  ));
}

module.exports = { computeRisk, riskDecision, calculateRisk };