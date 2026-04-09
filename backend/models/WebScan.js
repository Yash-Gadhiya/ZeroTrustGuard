const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const WebScan = sequelize.define("WebScan", {
  scanDate: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: "COMPLETED"
  },
  scan_type: {
    type: DataTypes.STRING,
    allowNull: true
  },
  vulnerabilities: {
    type: DataTypes.JSON,
    allowNull: true
  }
}, {
  timestamps: true
});

module.exports = WebScan;
