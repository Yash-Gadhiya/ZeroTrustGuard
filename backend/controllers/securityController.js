const ActivityLog = require("../models/ActivityLog");
const User = require("../models/User");
const { Op } = require("sequelize");

// Get security alerts (riskScore >= 70)
exports.getAlerts = async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ message: "Access denied." });
    }

    const { timeRange, startDate, endDate, department, searchEmail } = req.query;

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

    const baseConditions = [
      {
        [Op.or]: [
          { riskScore: { [Op.gte]: 70 } },
          { action: { [Op.in]: ['ACCOUNT_UNBLOCK', 'DELETE_USER'] } }
        ]
      }
    ];

    if (dateFilter) {
      baseConditions.push({ createdAt: dateFilter });
    }

    if (department) {
      baseConditions.push({
        [Op.or]: [
          { department: department },
          { '$User.department$': department }
        ]
      });
    }

    const whereClause = {
      [Op.and]: baseConditions
    };

    const includeUser = {
      model: User,
      attributes: ["id", "email", "name", "department"]
    };

    if (searchEmail) {
      includeUser.where = { email: { [Op.like]: `%${searchEmail}%` } };
      includeUser.required = true;
    }

    const alerts = await ActivityLog.findAll({
      where: whereClause,
      include: [includeUser],
      order: [["createdAt", "DESC"]],
      limit: 100
    });

    // Ensure we always return an array even if empty
    res.status(200).json({
      message: "Security alerts fetched successfully",
      alerts: alerts || []
    });
  } catch (error) {
    console.error("Fetch security alerts error:", error);
    res.status(500).json({ message: "Failed to fetch security alerts", alerts: [] });
  }
};

// Resolve Alert
exports.resolveAlert = async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ message: "Access denied." });
    }

    const { id } = req.params;
    const alert = await ActivityLog.findByPk(id);

    if (!alert) return res.status(404).json({ message: "Alert not found" });

    // Syncing with the frontend "RESOLVED" status
    alert.status = "RESOLVED";
    alert.resolved = true; 
    alert.resolvedBy = req.user.id;
    
    await alert.save();

    res.status(200).json({ message: "Alert resolved successfully", alert });
  } catch (error) {
    console.error("Resolve alert error:", error);
    res.status(500).json({ message: "Failed to resolve alert" });
  }
};

// Reject Alert
exports.rejectAlert = async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ message: "Access denied." });
    }

    const { id } = req.params;
    const { admin_comment } = req.body;
    const alert = await ActivityLog.findByPk(id);

    if (!alert) return res.status(404).json({ message: "Alert not found" });

    alert.status = "REJECTED";
    alert.resolved = true; 
    alert.resolvedBy = req.user.id;
    if (admin_comment) {
      alert.admin_comment = admin_comment;
    }
    
    await alert.save();

    res.status(200).json({ message: "Alert rejected successfully", alert });
  } catch (error) {
    console.error("Reject alert error:", error);
    res.status(500).json({ message: "Failed to reject alert" });
  }
};