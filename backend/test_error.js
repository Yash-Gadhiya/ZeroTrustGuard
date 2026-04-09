const { connectDB, sequelize } = require("./config/database");

const User = require("./models/User");
const ActivityLog = require("./models/ActivityLog");
require("./models/Alert");

ActivityLog.belongsTo(User, { foreignKey: "userId" });
User.hasMany(ActivityLog, { foreignKey: "userId" });

async function getLogs() {
  await connectDB();
  try {
    const logs = await ActivityLog.findAll({
      include: [{
        model: User,
        attributes: ["id", "email", "name", "department"]
      }],
      order: [["createdAt", "DESC"]],
      limit: 100
    });
    require("fs").writeFileSync("error_dump.txt", "SUCCESS: " + JSON.stringify(logs).substring(0, 100));
  } catch (error) {
    require("fs").writeFileSync("error_dump.txt", "ERROR: " + error.message + "\n" + error.stack);
  }
  process.exit(0);
}

getLogs();
