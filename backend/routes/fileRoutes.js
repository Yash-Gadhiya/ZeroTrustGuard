const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");
const { validate } = require("../middleware/validate");
const { uploadFileSchema, accessRequestSchema } = require("../middleware/schemas");

const fileController = require("../controllers/fileController");

// Route: POST /api/files/upload
// Desc: Upload a new file
router.post(
  "/upload",
  authMiddleware,
  upload.single("file"),      // multer first — parses multipart
  validate(uploadFileSchema), // then validate the text fields
  fileController.uploadFile
);

// Get all files (admin only)
router.get(
  "/all",
  authMiddleware,
  fileController.getAllFiles
);

// Get my files
router.get(
  "/my-files",
  authMiddleware,
  fileController.getMyFiles
);

// Download file
router.get(
  "/download/:id",
  authMiddleware,
  fileController.downloadFile
);

// View file
router.get(
  "/view/:id",
  authMiddleware,
  fileController.viewFile
);

// Request access
router.post(
  "/request-access",
  authMiddleware,
  validate(accessRequestSchema),
  fileController.requestAccess
);

// Delete file (Admin)
router.delete(
  "/:id",
  authMiddleware,
  fileController.deleteFile
);

// Update permissions (Admin)
router.patch(
  "/:id/permissions",
  authMiddleware,
  fileController.updateFilePermissions
);

module.exports = router;