const User = require("../models/User");
const File = require("../models/File");
const AccessRequest = require("../models/AccessRequest");
const ActivityLog = require("../models/ActivityLog");
const { Op } = require("sequelize");

// Get stats
exports.getStats = async (req, res) => {
  try {
    // Check if admin/super_admin
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

    // USER QUERY
    const userWhere = {};
    if (dateFilter) userWhere.createdAt = dateFilter;
    if (department) userWhere.department = department;
    if (searchEmail) userWhere.email = { [Op.like]: `%${searchEmail}%` };
    const totalUsers = await User.count({ where: userWhere });

    // Include object for relations
    const userInclude = { model: User, required: !!(department || searchEmail) };
    const userNestedWhere = {};
    if (department) userNestedWhere.department = department;
    if (searchEmail) userNestedWhere.email = { [Op.like]: `%${searchEmail}%` };
    if (Object.keys(userNestedWhere).length > 0) userInclude.where = userNestedWhere;

    // FILE QUERY
    const fileWhere = {};
    if (dateFilter) fileWhere.createdAt = dateFilter;
    if (department) {
      fileWhere[Op.or] = [ { department: department }, { '$User.department$': department } ];
    }
    const totalFiles = await File.count({ where: fileWhere, include: [userInclude] });

    // ACCESS REQUEST QUERY (No department embedded, depends strictly on User)
    const requestWhere = {};
    if (dateFilter) requestWhere.createdAt = dateFilter;
    // AccessRequest models typically map User as `Requester`. Let's just use the standard association structure.
    // Wait, AccessRequest.belongsTo(User, { as: "Requester", foreignKey: "userId" })
    const requesterInclude = { model: User, as: "Requester", required: !!(department || searchEmail) };
    if (Object.keys(userNestedWhere).length > 0) requesterInclude.where = userNestedWhere;
    const totalRequests = await AccessRequest.count({ where: requestWhere, include: [requesterInclude] });

    // ALERT LOG QUERY
    const alertBaseConditions = [
      {
        [Op.or]: [
          { riskScore: { [Op.gte]: 70 } },
          { action: { [Op.in]: ['ACCOUNT_UNBLOCK', 'DELETE_USER'] } }
        ]
      }
    ];
    if (dateFilter) alertBaseConditions.push({ createdAt: dateFilter });
    if (department) {
      alertBaseConditions.push({
        [Op.or]: [ { department: department }, { '$User.department$': department } ]
      });
    }
    const totalAlerts = await ActivityLog.count({
      where: { [Op.and]: alertBaseConditions },
      include: [userInclude] // Uses the default User model mapping
    });

    res.status(200).json({
      totalUsers,
      totalFiles,
      totalRequests,
      totalAlerts
    });
  } catch (error) {
    console.error("Fetch dashboard stats error:", error);
    res.status(500).json({
      message: "Failed to fetch dashboard stats"
    });
  }
};
