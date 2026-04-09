const User = require("../models/User");
const ActivityLog = require("../models/ActivityLog");
const Alert = require("../models/Alert");
const bcrypt = require("bcrypt");

// ... we will append delete user
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Admin check
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ message: "Access denied." });
    }

    const userToDelete = await User.findByPk(id);

    if (!userToDelete) {
      return res.status(404).json({ message: "User not found." });
    }

    const adminUser = await User.findByPk(req.user.id);
    if (adminUser && adminUser.mfaEnabled) {
      const mfaPin = req.headers["x-mfa-pin"];
      if (!mfaPin) return res.status(403).json({ mfaRequired: true, message: "MFA PIN required for admin actions." });
      const isValid = await bcrypt.compare(mfaPin, adminUser.mfaPin);
      if (!isValid) return res.status(403).json({ mfaRequired: true, message: "Invalid MFA PIN." });
    }

    // Prevent deleting admin
    if (userToDelete.role === "admin" || userToDelete.role === "super_admin") {
      return res.status(403).json({ message: "Cannot delete admin users." });
    }

    await userToDelete.destroy();

    // Log the action
    await ActivityLog.create({
      userId: req.user.id, // Must use Admin ID since userToDelete is destroyed!
      action: "DELETE_USER",
      riskScore: 100,
      resource: `User ${userToDelete.email} deleted by Admin`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      status: "RESOLVED",
      department: userToDelete.department
    });

    await Alert.create({
      userId: req.user.id, 
      riskScore: 100,
      reason: `User ${userToDelete.email} deleted by Admin`,
      status: "RESOLVED"
    });

    res.status(200).json({ message: "User deleted successfully." });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ message: "Failed to delete user." });
  }
};
