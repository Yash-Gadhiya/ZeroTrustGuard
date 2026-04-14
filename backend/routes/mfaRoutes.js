const express = require("express");
const router  = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const mfaController  = require("../controllers/mfaController");

// [H1] TOTP Setup — generates secret + QR code
router.post("/setup",   authMiddleware, mfaController.setupTotp);

// [H1] TOTP Verify — used for both enrollment confirmation AND login step
//   body: { token: "123456", confirmSetup?: true }
router.post("/verify",  authMiddleware, mfaController.verifyTotp);

// Admin MFA reset request flow (unchanged)
router.post("/request-change",  authMiddleware, mfaController.requestChange);
router.post("/approve/:id",     authMiddleware, mfaController.approveChange);
router.post("/reject/:id",      authMiddleware, mfaController.rejectChange);
router.get("/requests",         authMiddleware, mfaController.getPendingRequests);
router.get("/my-requests",      authMiddleware, mfaController.getMyRequests);

module.exports = router;
