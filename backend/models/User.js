const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const User = sequelize.define("User", {

  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },

  name: {
    type: DataTypes.STRING,
    allowNull: true // Changed to true (or keep as true) to ensure existing users work if name is temporarily null
  },

  email: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },

  password: {
    type: DataTypes.STRING,
    allowNull: false
  },

  role: {
    type: DataTypes.ENUM("intern","staff","senior","admin","super_admin"),
    allowNull: false,
    defaultValue: "intern"
  },

  department: {
    type: DataTypes.STRING,
    allowNull: true
  },

  designation: {
    type: DataTypes.STRING,
    allowNull: true
  },

  designation_level: {
    type: DataTypes.INTEGER,
    allowNull: true, // Changed from false to true
    defaultValue: null // Removed '1'
  },

  // Login protection
  login_failed_attempts: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },

  blocked_until: {
    type: DataTypes.DATE,
    allowNull: true
  },

  block_reason: {
    type: DataTypes.STRING,
    allowNull: true
  },

  is_blocked: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },

  // MFA — TOTP (Google Authenticator / Authy)
  // [H1] Replaced mfaPin (4-digit bcrypt) with mfaSecret (TOTP base32 secret)
  mfaSecret: {
    type: DataTypes.STRING,
    allowNull: true
  },

  mfaEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },

  mfaFailedAttempts: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },

  mfaLockUntil: {
    type: DataTypes.DATE,
    allowNull: true
  }

}, {
  tableName: "Users"
});

module.exports = User;