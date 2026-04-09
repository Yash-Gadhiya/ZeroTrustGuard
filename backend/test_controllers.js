const { connectDB, sequelize } = require("./config/database");

// Must require all models and set up relationships like server.js does
const User = require("./models/User");
const ActivityLog = require("./models/ActivityLog");

ActivityLog.belongsTo(User, { foreignKey: "userId" });
User.hasMany(ActivityLog, { foreignKey: "userId" });

const activityController = require("./controllers/activityController");
const securityController = require("./controllers/securityController");

async function checkControllers() {
  try {
    await connectDB();
    await sequelize.sync({ alter: true });
    
    console.log("Database connected & synced. Invoking getLogs...");

    const req = { user: { role: "admin", id: 1 } };
    const res = {
      status: (code) => ({
        json: (data) => {
          console.log(`[getLogs] Status ${code}`, data);
        }
      })
    };

    await activityController.getLogs(req, res);

    console.log("Invoking getAlerts...");
    const res2 = {
      status: (code) => ({
        json: (data) => {
          console.log(`[getAlerts] Status ${code}`, data);
        }
      })
    };
    await securityController.getAlerts(req, res2);

  } catch (err) {
    console.error("Script failed:", err);
  } finally {
    process.exit(0);
  }
}

checkControllers();
