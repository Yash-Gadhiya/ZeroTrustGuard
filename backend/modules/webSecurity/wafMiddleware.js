const BlockedIP = require("../../models/BlockedIP");
const ActivityLog = require("../../models/ActivityLog");
const User = require("../../models/User");

const wafMiddleware = async (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;

  // Check if IP is already blocked
  try {
    const isBlocked = await BlockedIP.findOne({ where: { ipAddress: ip } });
    if (isBlocked) {
      return res.status(403).json({ error: "Access Denied: IP Blocked by WAF" });
    }
  } catch (err) {
    console.error("WAF BlockedIP Check Error:", err);
  }

  // Define signatures
  const sqlInjectionPattern = /(?:'|")\s*OR\s+(?:1\s*=\s*1|true)/i;
  const xssPattern = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/i;
  const simpleXss = /<script>/i;

  const hasMaliciousPayload = (obj) => {
    if (!obj) return false;
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        const val = obj[key];
        if (sqlInjectionPattern.test(val) || xssPattern.test(val) || simpleXss.test(val)) {
          return true;
        }
      }
    }
    return false;
  };

  const isMalicious = hasMaliciousPayload(req.body) || hasMaliciousPayload(req.query);

  if (isMalicious) {
    console.log(`[WAF] Malicious payload detected from IP: ${ip}`);
    
    // 1. Block IP
    try {
      await BlockedIP.create({ ipAddress: ip, reason: "SQLi/XSS Signature Detected" });
    } catch(err) {
      console.error("WAF BlockedIP Create Error:", err);
    }
    
    // 2. Resolve userId for ActivityLog
    let userId = null;
    if (req.user && req.user.id) {
      userId = req.user.id;
    } else if (req.body && req.body.email) {
      try {
        const user = await User.findOne({ where: { email: req.body.email } });
        if (user) userId = user.id;
      } catch (err) {}
    }
    
    if (!userId) {
      // Fallback: assign to the first admin or a systemic ID
      try {
        const admin = await User.findOne({ where: { role: 'admin' } });
        userId = admin ? admin.id : 1; 
      } catch (err) {
        userId = 1;
      }
    }

    // 3. Create high-risk ActivityLogs entry
    try {
      await ActivityLog.create({
        userId: userId,
        action: "WAF_BLOCK",
        riskScore: 99,
        resource: `Blocked Malicious Payload from IP: ${ip}`,
        ipAddress: ip,
        userAgent: req.headers["user-agent"] || "Unknown",
        status: "FAILED",
        department: "SOC"
      });
    } catch(err) {
      console.error("WAF ActivityLog Error:", err);
    }

    return res.status(403).json({ error: "Access Denied: Malicious Request Detected" });
  }

  next();
};

module.exports = wafMiddleware;
