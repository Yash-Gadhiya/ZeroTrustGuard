const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const ActivityLog = sequelize.define("ActivityLog", {
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
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

module.exports = ActivityLog;