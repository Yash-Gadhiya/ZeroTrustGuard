const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const FilePermission = sequelize.define("FilePermission", {

  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },

  fileId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },

  allowIntern: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },

  allowStaff: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },

  allowSenior: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }

});

module.exports = FilePermission;