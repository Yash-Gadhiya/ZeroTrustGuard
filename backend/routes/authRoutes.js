const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const verifyToken = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");
const { registerSchema, loginSchema } = require("../middleware/schemas");

router.post("/register", validate(registerSchema), authController.register);
router.post("/login",    validate(loginSchema),    authController.login);

// Profile
router.get("/profile", verifyToken, authController.getProfile);

// [H2] Logout — adds token jti to blacklist for immediate revocation
router.post("/logout", verifyToken, authController.logout);

module.exports = router;