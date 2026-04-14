const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");
const { approveRequestSchema, rejectRequestSchema } = require("../middleware/schemas");
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
  validate(approveRequestSchema),
  accessRequestController.approveRequest
);

// Reject request
router.post(
  "/:id/reject",
  verifyToken,
  validate(rejectRequestSchema),
  accessRequestController.rejectRequest
);

module.exports = router;
