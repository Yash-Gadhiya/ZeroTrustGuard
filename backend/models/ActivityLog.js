const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const ActivityLog = sequelize.define("ActivityLog", {
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true   // null = anonymous/system action (WAF blocks, log purge events)
  },

  action: {
    type: DataTypes.STRING,
    allowNull: false
  },

  fileId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },

  resource: {
    type: DataTypes.STRING,
  },

  ipAddress: {
    type: DataTypes.STRING,
  },

  userAgent: {
    type: DataTypes.STRING,
  },

  riskScore: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },

  department: {
    type: DataTypes.STRING,
    allowNull: true
  },

  resolved: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },

  resolvedBy: {
    type: DataTypes.INTEGER,
    allowNull: true
  },

  decision: {
    type: DataTypes.STRING, // ALLOW / MFA / BLOCK
  },

  status: {
    type: DataTypes.STRING, // SUCCESS / FAILED
  },

  admin_comment: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  timestamps: true // ensures createdAt & updatedAt
});

// ── Real-time socket hooks ───────────────────────────────────────────────────
// These fire for EVERY create/update — controllers, cron jobs, seed scripts, etc.
ActivityLog.addHook("afterCreate", (log) => {
  try {
    const io = require("../utils/socket").getIo();
    if (io) io.to("soc").emit("new_activity", log.toJSON());
  } catch (_) {}
});

ActivityLog.addHook("afterUpdate", (log) => {
  try {
    const io = require("../utils/socket").getIo();
    if (io) io.to("soc").emit("update_activity", log.toJSON());
  } catch (_) {}
});

module.exports = ActivityLog;