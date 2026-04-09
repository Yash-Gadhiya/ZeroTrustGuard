const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const mfaController = require("../controllers/mfaController");

router.post("/set-pin", authMiddleware, mfaController.setPin);
router.post("/verify-pin", authMiddleware, mfaController.verifyPin);
router.post("/request-change", authMiddleware, mfaController.requestChange);
router.post("/approve/:id", authMiddleware, mfaController.approveChange);
router.post("/reject/:id", authMiddleware, mfaController.rejectChange);
router.post("/update-pin", authMiddleware, mfaController.updatePin);
router.get("/requests", authMiddleware, mfaController.getPendingRequests);

module.exports = router;
