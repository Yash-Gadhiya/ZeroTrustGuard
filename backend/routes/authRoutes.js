const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const verifyToken = require("../middleware/authMiddleware");

router.post("/register", authController.register);
router.post("/login", authController.login);

// ✅ Profile route
router.get("/profile", verifyToken, authController.getProfile);

module.exports = router;