const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const BlockedIP = sequelize.define("BlockedIP", {
  ipAddress: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  reason: {
    type: DataTypes.STRING,
    allowNull: true
  },
  blockedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  timestamps: true
});

module.exports = BlockedIP;
