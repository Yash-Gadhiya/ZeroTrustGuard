const { connectDB, sequelize } = require("./config/database");
const User = require("./models/User");
const ActivityLog = require("./models/ActivityLog");

ActivityLog.belongsTo(User, { foreignKey: "userId" });
User.hasMany(ActivityLog, { foreignKey: "userId" });

async function check() {
  await connectDB();
  const count = await ActivityLog.count();
  const highRisk = await ActivityLog.count({ where: { riskScore: { [require("sequelize").Op.gte]: 70 } } });
  
  require("fs").writeFileSync("db_count.txt", `ActivityLog count: ${count}, High Risk: ${highRisk}`);
  process.exit(0);
}
check();
