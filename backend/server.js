const express   = require("express");
const cors       = require("cors");
const helmet     = require("helmet");
const rateLimit  = require("express-rate-limit");
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

// [C1] WAF Middleware — imported once, applied globally before ALL routes
const wafMiddleware = require("./modules/webSecurity/wafMiddleware");

const app = express();

// ── [H5] Helmet — sets 12 security headers in one line ───────────────────────
app.use(helmet());

// ── [H3] CORS — restrict to configured frontend origin only ──────────────────
app.use(cors({
  origin:      process.env.FRONTEND_URL || "http://localhost:8081",
  credentials: true,
}));

app.use(express.json());

// ── [H4] Rate limiting ────────────────────────────────────────────────────────
// Global limiter: 100 requests per 15 minutes per IP
const globalLimiter = rateLimit({
  windowMs:       15 * 60 * 1000,
  max:            100,
  standardHeaders: true,
  legacyHeaders:  false,
  message:        { message: "Too many requests from this IP, please try again after 15 minutes." },
});

// Auth limiter: 10 requests per 15 minutes per IP (brute-force protection)
const authLimiter = rateLimit({
  windowMs:       15 * 60 * 1000,
  max:            10,
  standardHeaders: true,
  legacyHeaders:  false,
  message:        { message: "Too many login attempts. Please wait 15 minutes before trying again." },
});

app.use(globalLimiter);

// [C1] Apply WAF globally — protects all 11 route groups (was only on 2)
// [C2] express.static("/uploads") REMOVED — files must be accessed via authenticated
//      /api/files/view/:id or /api/files/download/:id endpoints only
app.use(wafMiddleware);

// Routes — auth route gets the stricter limiter
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/files", fileRoutes);
app.use("/api", protectedRoutes);
app.use("/api/soc", socRoutes);
app.use("/api/access-requests", accessRequestRoutes);
app.use("/api/security", securityRoutes);
app.use("/api/activity-logs", activityRoutes);
app.use("/api/users", userRoutes);
app.use("/api/mfa", mfaRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/websecurity", webSecurityRoutes);

// Health check route
app.get("/", (req, res) => {
  res.send("ZeroTrustGuard Backend Running...");
});

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await connectDB();

    // [C4] Changed from { alter: true } — which silently mutates DB schema on every restart —
    //      to { force: false } which only creates tables if they don't exist. Safe for production.
    await sequelize.sync({ force: false });

    console.log("Database synced successfully");

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

  } catch (error) {
    console.error("Startup error:", error);
  }
}

startServer();