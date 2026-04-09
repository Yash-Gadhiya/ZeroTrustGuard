const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/authMiddleware");
const { calculateRisk, riskDecision } = require("../services/riskEngine");

const ActivityLog = require("../models/ActivityLog");
const Alert = require("../models/Alert");

router.get("/access-sensitive", verifyToken, async (req, res) => {
  try {
    const sensitivity = 80;
    const anomalyScore = Math.floor(Math.random() * 100);
    const frequency = 40;
    const context = 30;

    const risk = calculateRisk({
      sensitivity,
      anomalyScore,
      frequency,
      context
    });

    const decision = riskDecision(risk);

    // Log activity
    await ActivityLog.create({
      userId: req.user.id,
      action: "ACCESS",
      resource: "Sensitive Data",
      ipAddress: req.ip || req.connection.remoteAddress,
      riskScore: risk,
      decision,
      status: decision === "BLOCK" ? "FAILED" : "SUCCESS"
    });

    // If high risk → create alert
    if (decision === "BLOCK") {
      await Alert.create({
        userId: req.user.id,
        riskScore: risk,
        reason: "High Risk Access Attempt"
      });

      return res.status(403).json({
        message: "Access Blocked - High Risk",
        riskScore: risk,
        decision
      });
    }

    res.json({
      message: "Access Decision Completed",
      riskScore: risk,
      decision
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
// Update Alert Status (SOC Action)
router.put("/soc/alerts/:id", verifyToken, async (req, res) => {
  try {
    const { status } = req.body;
    const alertId = req.params.id;

    const alert = await Alert.findByPk(alertId);

    if (!alert) {
      return res.status(404).json({ message: "Alert not found" });
    }

    alert.status = status;
    await alert.save();
    await alert.reload(); // ensures latest DB data

    res.json({
      message: "Alert status updated successfully",
      alert: alert.toJSON()
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
module.exports = router;