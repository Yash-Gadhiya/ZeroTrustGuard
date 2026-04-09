const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const File = sequelize.define("File", {

  filename: {
    type: DataTypes.STRING,
    allowNull: false
  },

  originalName: {
    type: DataTypes.STRING,
    allowNull: true // Human-readable original filename for display
  },

  path: {
    type: DataTypes.STRING,
    allowNull: false
  },

  uploadedBy: {
    type: DataTypes.INTEGER,
    allowNull: false
  },

  department: {
    type: DataTypes.STRING,
    allowNull: true
  },

  // Permission system
  allowedRoles: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [] // e.g: ["admin", "senior", "staff", "intern"]
  },

  // Sensitivity classification
  sensitivityLevel: {
    type: DataTypes.ENUM("low", "high", "critical"),
    defaultValue: "low"
  },

  // Multi-Department targeting — JSON array (e.g., ["IT", "HR"]). ["All Departments"] means visible to all.
  target_department: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: ["All Departments"]
  }

});

const User = require("./User");
File.belongsTo(User, { foreignKey: "uploadedBy" });

module.exports = File;