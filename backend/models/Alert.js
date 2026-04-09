const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Alert = sequelize.define("Alert", {
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  riskScore: {
    type: DataTypes.INTEGER
  },
  reason: {
    type: DataTypes.STRING
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: "OPEN"
  }
});

module.exports = Alert;