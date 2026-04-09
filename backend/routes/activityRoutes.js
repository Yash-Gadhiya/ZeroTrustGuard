const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const activityController = require("../controllers/activityController");

// Route: GET /api/activity-logs
// Desc: Get recent activity logs (Admin only)
router.get("/", authMiddleware, activityController.getLogs);

module.exports = router;
