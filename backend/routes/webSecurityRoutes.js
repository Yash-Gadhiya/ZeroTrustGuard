const express = require("express");
const router = express.Router();
const scannerController = require("../modules/webSecurity/scannerController");
const verifyToken = require("../middleware/authMiddleware");

// Routes for web security scanning features
router.get("/scans", verifyToken, scannerController.getScans);
router.post("/scan", verifyToken, scannerController.runScan);
router.post("/stop", verifyToken, scannerController.stopScan);
router.get("/report/:id", verifyToken, scannerController.generatePdfReport);

module.exports = router;
