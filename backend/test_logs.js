const { connectDB, sequelize } = require("./config/database");

// Models
const User = require("./models/User");
const ActivityLog = require("./models/ActivityLog");
require("./models/Alert");

ActivityLog.belongsTo(User, { foreignKey: "userId" });
User.hasMany(ActivityLog, { foreignKey: "userId" });

async function checkDatabase() {
  try {
    await connectDB();
    await sequelize.sync({ alter: true });
    
    console.log("Database connected & synced");

    const logs = await ActivityLog.findAll({
      include: [{
        model: User,
        attributes: ["id", "email", "name", "department"]
      }],
      order: [["createdAt", "DESC"]],
      limit: 5
    });

    console.log("--- LATEST LOGS ---");
    console.log(JSON.stringify(logs, null, 2));

  } catch (err) {
    console.error("Script failed:", err);
  } finally {
    process.exit(0);
  }
}

checkDatabase();
