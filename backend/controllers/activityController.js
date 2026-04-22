const ActivityLog = require("../models/ActivityLog");
const User = require("../models/User");
const { sequelize } = require("../config/database");
const { Op, fn, col, literal } = require("sequelize");
const PDFDocument = require("pdfkit");

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/activity-logs/my-logs  (any authenticated user)
// Returns only the caller's own logs — scoped by userId
// ─────────────────────────────────────────────────────────────────────────────
exports.getMyLogs = async (req, res) => {
  try {
    const {
      timeRange, startDate, endDate,
      action, decision, riskRange,
      page = 1, pageSize = 25,
    } = req.query;

    const now  = new Date();
    const size = Math.min(parseInt(pageSize, 10) || 25, 100);
    const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * size;

    // ── Date filter ────────────────────────────────────────────────────────
    let dateFilter = null;
    if (timeRange === "24_hours") {
      dateFilter = { [Op.gte]: new Date(now.getTime() - 24 * 60 * 60 * 1000) };
    } else if (timeRange === "7_days") {
      dateFilter = { [Op.gte]: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
    } else if (timeRange === "3_months") {
      dateFilter = { [Op.gte]: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) };
    } else if (timeRange === "1_year") {
      dateFilter = { [Op.gte]: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000) };
    } else if (timeRange === "custom" && startDate && endDate) {
      const start = new Date(startDate);
      const end   = new Date(endDate);
      if (start > end) {
        return res.status(400).json({ message: "startDate must be before endDate" });
      }
      end.setHours(23, 59, 59, 999);
      dateFilter = { [Op.between]: [start, end] };
    }

    // ── Risk range filter ──────────────────────────────────────────────────
    let riskFilter = null;
    if (riskRange) {
      const [lo, hi] = riskRange.split("-").map(Number);
      if (!isNaN(lo) && !isNaN(hi)) riskFilter = { [Op.between]: [lo, hi] };
    }

    // ── Build where clause ─────────────────────────────────────────────────
    const where = { userId: req.user.id };
    if (dateFilter)  where.createdAt = dateFilter;
    if (riskFilter)  where.riskScore = riskFilter;
    if (decision)    where.decision  = decision;
    if (action)      where.action    = { [Op.like]: `%${String(action).slice(0, 100)}%` };

    const { count, rows: logs } = await ActivityLog.findAndCountAll({
      where,
      order:  [["createdAt", "DESC"]],
      limit:  size,
      offset,
    });

    res.status(200).json({
      logs,
      total:      count,
      page:       parseInt(page, 10) || 1,
      pageSize:   size,
      totalPages: Math.max(1, Math.ceil(count / size)),
    });
  } catch (error) {
    console.error("getMyLogs error:", error);
    res.status(500).json({ message: "Failed to fetch your activity" });
  }
};


// Get activity logs
exports.getLogs = async (req, res) => {
  try {
    // Check if admin/super_admin
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ message: "Access denied." });
    }

    const { timeRange, startDate, endDate, department, searchEmail } = req.query;
    const { Op } = require("sequelize");

    let dateFilter = null;
    const now = new Date();

    if (timeRange) {
      if (timeRange === "24_hours") {
        dateFilter = { [Op.gte]: new Date(now.getTime() - 24 * 60 * 60 * 1000) };
      } else if (timeRange === "7_days") {
        dateFilter = { [Op.gte]: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
      } else if (timeRange === "3_months") {
        dateFilter = { [Op.gte]: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) };
      } else if (timeRange === "1_year") {
        dateFilter = { [Op.gte]: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000) };
      } else if (timeRange === "custom" && startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter = { [Op.between]: [start, end] };
      }
    }

    const baseConditions = [];
    if (dateFilter) baseConditions.push({ createdAt: dateFilter });
    
    if (department) {
      baseConditions.push({
        [Op.or]: [
          { department: department },
          { '$User.department$': department }
        ]
      });
    }

    const whereClause = baseConditions.length > 0 ? { [Op.and]: baseConditions } : {};

    const includeUser = {
      model: User,
      attributes: ["id", "email", "name", "department"]
    };

    if (searchEmail) {
      includeUser.where = { email: { [Op.like]: `%${String(searchEmail).slice(0, 254)}%` } };
      includeUser.required = true;
    }

    // Return all logs ordered by newest (pagination handled client-side)
    const logs = await ActivityLog.findAll({
      where: whereClause,
      include: [includeUser],
      order: [["createdAt", "DESC"]],
    });

    res.status(200).json({
      message: "Activity logs fetched successfully",
      logs
    });
  } catch (error) {
    console.error("Fetch activity logs error:", error);
    res.status(500).json({
      message: "Failed to fetch activity logs"
    });
  }
};

// ─── UBA Report ─────────────────────────────────────────────────────────────
// Returns top 10 riskiest users based on avg/max riskScore over last 7 days
exports.getUbaReport = async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ message: "Access denied." });
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const rows = await ActivityLog.findAll({
      where: { createdAt: { [Op.gte]: sevenDaysAgo } },
      attributes: [
        "userId",
        [fn("AVG", col("riskScore")), "avgRisk"],
        [fn("MAX", col("riskScore")), "peakRisk"],
        [fn("COUNT", col("ActivityLog.id")), "actionCount"],
      ],
      include: [{
        model: User,
        attributes: ["email", "name", "department", "role"],
        required: true,
      }],
      group: ["userId", "User.id"],
      order: [[literal('"avgRisk"'), "DESC"]],
      limit: 10,
      raw: false,
    });

    const result = rows.map(r => ({
      userId:      r.userId,
      email:       r.User?.email,
      name:        r.User?.name,
      department:  r.User?.department,
      role:        r.User?.role,
      avgRisk:     Math.round(parseFloat(r.getDataValue("avgRisk")) || 0),
      peakRisk:    parseInt(r.getDataValue("peakRisk")) || 0,
      actionCount: parseInt(r.getDataValue("actionCount")) || 0,
    }));

    res.status(200).json({ users: result });
  } catch (error) {
    console.error("UBA Report error:", error);
    res.status(500).json({ message: "Failed to generate UBA report" });
  }
};

// ─── Audit Trail Export ──────────────────────────────────────────────────────
// Exports activity logs as CSV or PDF. Reuses getLogs filter logic.
exports.exportLogs = async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ message: "Access denied." });
    }

    const { timeRange, startDate, endDate, department, searchEmail, format = "csv" } = req.query;

    let dateFilter = null;
    const now = new Date();

    if (timeRange === "24_hours") dateFilter = { [Op.gte]: new Date(now.getTime() - 24 * 60 * 60 * 1000) };
    else if (timeRange === "7_days") dateFilter = { [Op.gte]: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
    else if (timeRange === "3_months") dateFilter = { [Op.gte]: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) };
    else if (timeRange === "1_year") dateFilter = { [Op.gte]: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000) };
    else if (timeRange === "custom" && startDate && endDate) {
      const start = new Date(startDate);
      const end   = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter = { [Op.between]: [start, end] };
    }

    const baseConditions = [];
    if (dateFilter) baseConditions.push({ createdAt: dateFilter });
    if (department) baseConditions.push({ department });

    const includeUser = {
      model: User,
      attributes: ["email", "name", "department"],
    };
    if (searchEmail) {
      includeUser.where = { email: { [Op.like]: `%${String(searchEmail).slice(0, 254)}%` } };
      includeUser.required = true;
    }

    const whereClause = baseConditions.length > 0 ? { [Op.and]: baseConditions } : {};
    const timestamp   = new Date().toISOString().replace(/[:.]/g, "-");
    const BATCH       = 1000;

    // ── CSV: true streaming — write 1000 rows at a time, never load all into memory ──
    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=AuditTrail_${timestamp}.csv`);
      res.write("Date,User Email,User Name,Department,Action,Resource,Risk Score,Decision,IP Address,Status\n");

      const escape = (v) => `"${String(v || "").replace(/"/g, '""')}"`;
      let offset = 0, hasMore = true;

      while (hasMore) {
        const batch = await ActivityLog.findAll({
          where: whereClause, include: [includeUser],
          order: [["createdAt", "DESC"]], limit: BATCH, offset,
        });
        if (batch.length === 0) break;

        res.write(batch.map(l => [
          escape(new Date(l.createdAt).toLocaleString()),
          escape(l.User?.email || l.userId || "anon"),
          escape(l.User?.name || ""),
          escape(l.department || l.User?.department || ""),
          escape(l.action),
          escape(l.resource || ""),
          escape(l.riskScore ?? ""),
          escape(l.decision || ""),
          escape(l.ipAddress || ""),
          escape(l.status || ""),
        ].join(",")).join("\n") + "\n");

        if (batch.length < BATCH) hasMore = false;
        offset += BATCH;
      }
      return res.end();
    }

    // ── PDF: fetch with hard safety cap (PDF at 10k rows ≈ 2MB already) ──────────
    const logs = await ActivityLog.findAll({
      where: whereClause, include: [includeUser],
      order: [["createdAt", "DESC"]], limit: 10000,
    });

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=AuditTrail_${timestamp}.pdf`);
    doc.pipe(res);

    doc.rect(0, 0, doc.page.width, doc.page.height).fill("#0f172a");
    doc.fillColor("#f8fafc").font("Helvetica-Bold").fontSize(22).text("ZeroTrustGuard", 50, 50, { align: "center" });
    doc.fillColor("#94a3b8").font("Helvetica").fontSize(12).text("Audit Trail Export", { align: "center" });
    doc.fillColor("#64748b").fontSize(9).text(`Generated: ${new Date().toLocaleString()} — ${logs.length} records`, { align: "center" });
    doc.moveDown(2);

    const colX = [50, 155, 275, 335, 400, 455, 505];
    const colW = [100, 115, 55,  60,  50,  45,  75];
    const hdrs = ["Date", "User Email", "Dept", "Action", "Resource", "Risk", "Decision"];

    const drawHeaders = () => {
      const hY = doc.y;
      doc.fillColor("#94a3b8").font("Helvetica-Bold").fontSize(8);
      hdrs.forEach((h, i) => doc.text(h, colX[i], hY, { width: colW[i], lineBreak: false }));
      doc.y = hY + 14;
      doc.rect(50, doc.y, 505, 0.5).fill("#334155");
      doc.y += 6;
    };
    drawHeaders();
    doc.font("Helvetica").fontSize(7.5);

    logs.forEach(l => {
      if (doc.y > 760) { doc.addPage(); doc.rect(0, 0, doc.page.width, doc.page.height).fill("#0f172a"); doc.y = 40; drawHeaders(); }
      const risk = l.riskScore ?? 0;
      const riskColor = risk >= 85 ? "#ef4444" : risk >= 65 ? "#f97316" : risk >= 30 ? "#facc15" : "#22c55e";
      const rowY = doc.y;
      [
        new Date(l.createdAt).toLocaleString().slice(0, 16),
        (l.User?.email || String(l.userId || "anon")).slice(0, 24),
        (l.department || l.User?.department || "").slice(0, 8),
        (l.action || "").slice(0, 12),
        (l.resource || "").slice(0, 10),
        String(risk),
        (l.decision || "").slice(0, 12),
      ].forEach((v, i) => doc.fillColor(i === 5 ? riskColor : "#cbd5e1").text(v, colX[i], rowY, { width: colW[i], lineBreak: false }));
      doc.y = rowY + 14;
    });
    doc.end();

  } catch (error) {
    console.error("Export logs error:", error);
    if (!res.headersSent) res.status(500).json({ message: "Failed to export logs" });
  }
};
