const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/authMiddleware");

const ActivityLog = require("../models/ActivityLog");
const Alert = require("../models/Alert");

// [REMOVED] /access-sensitive was a dev-only test route using Math.random() for risk scoring.
// Use the real risk engine endpoints instead.

// Update Alert Status (SOC Admin only)
router.put("/soc/alerts/:id", verifyToken, async (req, res) => {
  try {
    // [Security] Role check — this was missing, any user could mutate alerts
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ message: "Access denied." });
    }

    const { status } = req.body;
    const alertId = req.params.id;

    const alert = await Alert.findByPk(alertId);

    if (!alert) {
      return res.status(404).json({ message: "Alert not found" });
    }

    alert.status = status;
    await alert.save();
    await alert.reload();

    res.json({
      message: "Alert status updated successfully",
      alert: alert.toJSON()
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
module.exports = router;