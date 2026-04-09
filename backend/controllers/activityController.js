const ActivityLog = require("../models/ActivityLog");
const User = require("../models/User");

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
      includeUser.where = { email: { [Op.like]: `%${searchEmail}%` } };
      includeUser.required = true;
    }

    // Return last 100 logs ordered by newest
    const logs = await ActivityLog.findAll({
      where: whereClause,
      include: [includeUser],
      order: [["createdAt", "DESC"]],
      limit: 100
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
