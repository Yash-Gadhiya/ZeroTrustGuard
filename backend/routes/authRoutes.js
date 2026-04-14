const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const verifyToken = require("../middleware/authMiddleware");

router.post("/register", authController.register);
router.post("/login", authController.login);

// Profile
router.get("/profile", verifyToken, authController.getProfile);

// [H2] Logout — adds token jti to blacklist for immediate revocation
router.post("/logout", verifyToken, authController.logout);

module.exports = router;