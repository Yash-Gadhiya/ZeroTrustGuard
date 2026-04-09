const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/authMiddleware");
const accessRequestController = require("../controllers/accessRequestController");

// Get pending requests (based on hierarchy)
router.get(
  "/pending",
  verifyToken,
  accessRequestController.getPendingRequests
);

// Get my requests
router.get(
  "/my-requests",
  verifyToken,
  accessRequestController.getMyRequests
);

// Approve request
router.post(
  "/:id/approve",
  verifyToken,
  accessRequestController.approveRequest
);

// Reject request
router.post(
  "/:id/reject",
  verifyToken,
  accessRequestController.rejectRequest
);

module.exports = router;
