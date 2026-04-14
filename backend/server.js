const express    = require("express");
const cors       = require("cors");
const helmet     = require("helmet");
const rateLimit  = require("express-rate-limit");
const compression = require("compression");
const morgan     = require("morgan");
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
const wafMiddleware  = require("./modules/webSecurity/wafMiddleware");
// [C3] Risk Engine Middleware — applied to every authenticated route group
const riskMiddleware = require("./middleware/riskMiddleware");
// [A4] Centralized error handler — registered LAST after all routes
const errorHandler   = require("./middleware/errorHandler");
// [B1] SSE service for real-time SOC alerts
const { addClient }  = require("./services/sseService");
const verifyToken    = require("./middleware/authMiddleware");

const app = express();

// ── [P8] Gzip compression — reduces response sizes ~70% ──────────────────────
app.use(compression());

// ── [A6] HTTP request logging (dev only) ─────────────────────────────────────
if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

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

// Routes — auth route gets the stricter limiter but NO riskMiddleware (user not authenticated yet)
app.use("/api/auth",           authLimiter, authRoutes);
app.use("/api/files",          riskMiddleware, fileRoutes);
app.use("/api",                riskMiddleware, protectedRoutes);
app.use("/api/soc",            riskMiddleware, socRoutes);
app.use("/api/access-requests",riskMiddleware, accessRequestRoutes);
app.use("/api/security",       securityRoutes);   // WAF scanner — public-ish, no user context
app.use("/api/activity-logs",  riskMiddleware, activityRoutes);
app.use("/api/users",          riskMiddleware, userRoutes);
app.use("/api/mfa",            riskMiddleware, mfaRoutes);
app.use("/api/dashboard",      riskMiddleware, dashboardRoutes);
app.use("/api/websecurity",    riskMiddleware, webSecurityRoutes);

// [B1] SSE stream endpoint — real-time SOC alerts (admin only, no riskMiddleware to avoid scoring heartbeats)
app.get("/api/soc/stream", verifyToken, (req, res) => {
  if (req.user.role !== "admin" && req.user.role !== "super_admin") {
    return res.status(403).json({ message: "Admins only" });
  }
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable Nginx / Render buffering
  res.flushHeaders();

  // Send a heartbeat every 25s to keep the connection alive through proxies
  const heartbeat = setInterval(() => {
    try { res.write(":heartbeat\n\n"); } catch { clearInterval(heartbeat); }
  }, 25000);

  addClient(req.user.id, res);
  res.on("close", () => clearInterval(heartbeat));
});

// Health check route
app.get("/", (req, res) => {
  res.send("ZeroTrustGuard Backend Running...");
});

// [A4] Centralized error handler — MUST be last middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // [H8] JWT secret guard — fail fast if secret is weak or missing
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      console.error("[FATAL] JWT_SECRET must be at least 32 characters. Server stopped.");
      process.exit(1);
    }
    await connectDB();

    // [C4] Changed from { alter: true } — which silently mutates DB schema on every restart —
    //      to { force: false } which only creates tables if they don't exist. Safe for production.
    await sequelize.sync({ force: false });

    console.log("Database synced successfully");

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    // [A1] Start the Temporary Access Expiry cron worker AFTER DB is ready
    require("./workers/accessExpiry.worker");

  } catch (error) {
    console.error("Startup error:", error);
  }
}

startServer();