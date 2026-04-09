const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const TemporaryAccess = sequelize.define("TemporaryAccess", {

  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },

  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },

  fileId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },

  grantedBy: {
    type: DataTypes.INTEGER,
    allowNull: true
  },

  grantedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },

  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false
  },

  canView: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },

  canDownload: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }

});

module.exports = TemporaryAccess;