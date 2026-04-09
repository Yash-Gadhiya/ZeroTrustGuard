const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const dashboardController = require("../controllers/dashboardController");

// Route: GET /api/dashboard/stats
// Desc: Get system stats (Admin only)
router.get("/stats", authMiddleware, dashboardController.getStats);

module.exports = router;
