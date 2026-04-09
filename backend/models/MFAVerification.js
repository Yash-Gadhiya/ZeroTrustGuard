const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const MFAVerification = sequelize.define("MFAVerification", {

  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },

  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },

  fileId: {
    type: DataTypes.UUID,
    allowNull: false
  },

  method: {
    type: DataTypes.ENUM("otp","authenticator"),
    defaultValue: "otp"
  },

  verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }

});

module.exports = MFAVerification;