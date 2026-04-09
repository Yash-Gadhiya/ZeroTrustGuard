const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { connectDB, sequelize } = require("./config/database");

// Models
const User = require("./models/User");
const File = require("./models/File");
const FilePermission = require("./models/FilePermission");
const ActivityLog = require("./models/ActivityLog");
require("./models/Alert");
const AccessRequest = require("./models/AccessRequest");
require("./models/WebScan");
require("./models/BlockedIP");
const TemporaryAccess = require("./models/TemporaryAccess");
const MfaChangeRequest = require("./models/MfaChangeRequest");

// Relationships

User.hasMany(File, { foreignKey: "uploadedBy" });
File.belongsTo(User, { foreignKey: "uploadedBy" });

File.hasOne(FilePermission, { foreignKey: "fileId" });
FilePermission.belongsTo(File, { foreignKey: "fileId" });

AccessRequest.belongsTo(User, { foreignKey: "userId", as: "Requester" });
User.hasMany(AccessRequest, { foreignKey: "userId" });

AccessRequest.belongsTo(File, { foreignKey: "fileId" });
File.hasMany(AccessRequest, { foreignKey: "fileId" });

TemporaryAccess.belongsTo(User, { foreignKey: "userId" });
User.hasMany(TemporaryAccess, { foreignKey: "userId" });

TemporaryAccess.belongsTo(File, { foreignKey: "fileId" });
File.hasMany(TemporaryAccess, { foreignKey: "fileId" });

ActivityLog.belongsTo(User, { foreignKey: "userId" });
User.hasMany(ActivityLog, { foreignKey: "userId" });

// Routes
const authRoutes = require("./routes/authRoutes");
const protectedRoutes = require("./routes/protectedRoutes");
const fileRoutes = require("./routes/fileRoutes");
const socRoutes = require("./routes/socRoutes");
const accessRequestRoutes = require("./routes/accessRequestRoutes");
const securityRoutes = require("./routes/securityRoutes");
const activityRoutes = require("./routes/activityRoutes");
const userRoutes = require("./routes/userRoutes");
const mfaRoutes = require("./routes/mfaRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const webSecurityRoutes = require("./routes/webSecurityRoutes");
const wafMiddleware = require("./modules/webSecurity/wafMiddleware");

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Static file serving
app.use("/uploads", express.static("uploads"));

// Routes
app.use("/api/auth", wafMiddleware, authRoutes);
app.use("/api/files", fileRoutes);
app.use("/api", protectedRoutes);
app.use("/api/soc", socRoutes);
app.use("/api/access-requests", accessRequestRoutes);
app.use("/api/security", securityRoutes);
app.use("/api/activity-logs", activityRoutes);
app.use("/api/users", userRoutes);
app.use("/api/mfa", mfaRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/websecurity", wafMiddleware, webSecurityRoutes);

// Test route
app.get("/", (req, res) => {
  res.send("ZeroTrustGuard Backend Running...");
});

const PORT = process.env.PORT || 5000;

async function startServer() {

  try {

    await connectDB();

    await sequelize.sync({ alter: true });

    console.log("Database synced successfully");

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

  } catch (error) {

    console.error("Startup error:", error);

  }

}

startServer();