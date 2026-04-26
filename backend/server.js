const http       = require("http");
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
const ActiveSession = require("./models/ActiveSession");

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

ActiveSession.belongsTo(User, { foreignKey: "userId" });
User.hasMany(ActiveSession, { foreignKey: "userId" });

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
const sessionRoutes = require("./routes/sessionRoutes");

// [C1] WAF Middleware — imported once, applied globally before ALL routes
const wafMiddleware  = require("./modules/webSecurity/wafMiddleware");
// [C3] Risk Engine Middleware — applied to every authenticated route group
const riskMiddleware = require("./middleware/riskMiddleware");
// [A4] Centralized error handler — registered LAST after all routes
const errorHandler   = require("./middleware/errorHandler");
// [B1] SSE service for real-time SOC alerts
const { addClient }  = require("./services/sseService");
const verifyToken    = require("./middleware/authMiddleware");
const socketUtil     = require("./utils/socket");

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

// ── [P9] Trust proxy — Render (and most cloud hosts) sit behind a reverse proxy
// that sets X-Forwarded-For. Setting this to true tells Express to trust the entire
// proxy chain so express-rate-limit and req.ip can resolve the real client IP correctly.
app.set("trust proxy", true);

// ── [H4] Rate limiting ────────────────────────────────────────────────────────
// Helper: safely peek at the JWT role WITHOUT verifying the signature.
// Used ONLY for rate-limit bucketing — actual auth still happens in verifyToken.
const _peekRole = (req) => {
  try {
    const auth = req.headers.authorization || "";
    if (!auth.startsWith("Bearer ")) return null;
    const payload = JSON.parse(Buffer.from(auth.split(".")[1], "base64").toString());
    return payload.role || null;
  } catch { return null; }
};
const _isAdmin = (req) => ["admin", "super_admin"].includes(_peekRole(req));

// Standard limiter — 100 req/15 min for regular users and unauthenticated requests
const globalLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             100,
  standardHeaders: true,
  legacyHeaders:   false,
  skip:            (req) => _isAdmin(req), // admins use the limiter below
  message:         { message: "Too many requests from this IP, please try again after 15 minutes." },
});

// Admin limiter — 500 req/15 min for admin/super_admin (SOC Dashboard polling)
// skipSuccessfulRequests: only failed requests count, so normal polls don't eat the budget
const adminLimiter = rateLimit({
  windowMs:               15 * 60 * 1000,
  max:                    500,
  standardHeaders:        true,
  legacyHeaders:          false,
  skipSuccessfulRequests: true,
  skip:                   (req) => !_isAdmin(req), // non-admins use the limiter above
  message:                { message: "Too many requests from this IP, please try again after 15 minutes." },
});

// Auth limiter: 10 requests per 15 minutes per IP (brute-force protection)
// authLimiter moved directly to authRoutes to prevent blocking /profile
app.use(globalLimiter);
app.use(adminLimiter);

// [C1] Apply WAF globally — protects all 11 route groups (was only on 2)
// [C2] express.static("/uploads") REMOVED — files must be accessed via authenticated
//      /api/files/view/:id or /api/files/download/:id endpoints only
app.use(wafMiddleware);

// Routes 
app.use("/api/auth",           authRoutes);
app.use("/api/files",          riskMiddleware, fileRoutes);
app.use("/api",                riskMiddleware, protectedRoutes);
app.use("/api/soc",            riskMiddleware, socRoutes);
app.use("/api/access-requests",riskMiddleware, accessRequestRoutes);
app.use("/api/security",       riskMiddleware, securityRoutes);
app.use("/api/activity-logs",  riskMiddleware, activityRoutes);
app.use("/api/users",          riskMiddleware, userRoutes);
app.use("/api/mfa",            riskMiddleware, mfaRoutes);
app.use("/api/dashboard",      riskMiddleware, dashboardRoutes);
app.use("/api/websecurity",    riskMiddleware, webSecurityRoutes);
app.use("/api/sessions",       riskMiddleware, sessionRoutes);

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

    const httpServer = http.createServer(app);

    // Initialise Socket.IO AFTER DB sync so model hooks calling getIo() are safe
    socketUtil.init(httpServer);

    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    // [A1] Start the Temporary Access Expiry cron worker AFTER DB is ready
    require("./workers/accessExpiry.worker");

    // [A2] Start the Log Purge worker — deletes ActivityLog rows older than 12 months (daily at 02:00)
    require("./workers/logPurge.worker");

    // [A3] Start the DB Keep-Alive worker — pings Supabase every 2 days to prevent inactivity pause
    require("./workers/dbKeepAlive.worker");

  } catch (error) {
    console.error("Startup error:", error);
  }
}

startServer();