const { sequelize, connectDB } = require("./config/database");
const User = require("./models/User");
const ActivityLog = require("./models/ActivityLog");
require("./models/Alert");

ActivityLog.belongsTo(User, { foreignKey: "userId" });
User.hasMany(ActivityLog, { foreignKey: "userId" });

async function check() {
  await connectDB();
  // NO SYNC
  const count = await ActivityLog.count().catch(console.error);
  const highRisk = await ActivityLog.count({ where: { riskScore: { [require("sequelize").Op.gte]: 70 } } }).catch(console.error);
  
  require("fs").writeFileSync("db_count2.txt", `ActivityLog count: ${count}, High Risk: ${highRisk}`);
  process.exit(0);
}
check();
