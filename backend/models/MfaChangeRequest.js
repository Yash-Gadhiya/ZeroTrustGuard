const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const User = require("./User");

const MfaChangeRequest = sequelize.define("MfaChangeRequest", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: User,
      key: "id"
    }
  },
  status: {
    type: DataTypes.ENUM("pending", "approved", "rejected"),
    defaultValue: "pending"
  },
  approvedBy: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: "MfaChangeRequests"
});

User.hasMany(MfaChangeRequest, { foreignKey: 'userId' });
MfaChangeRequest.belongsTo(User, { foreignKey: 'userId' });

module.exports = MfaChangeRequest;
