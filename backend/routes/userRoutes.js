const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const userController = require("../controllers/userController");

// Route: DELETE /api/users/:id
// Desc: Delete a user (Admin only)
router.delete("/:id", authMiddleware, userController.deleteUser);

module.exports = router;
