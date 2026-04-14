const File         = require("../models/File");
const User         = require("../models/User");
const TemporaryAccess = require("../models/TemporaryAccess");
const ActivityLog  = require("../models/ActivityLog");
const AccessRequest = require("../models/AccessRequest");
const { Op }       = require("sequelize");
const path         = require("path");
const fs           = require("fs");
const speakeasy    = require("speakeasy");   // [H1] TOTP verification
const { computeRisk } = require("../services/riskEngine");

// Upload File
exports.uploadFile = async (req, res) => {
  try {
    console.log("--- START UPLOAD FILE ROUTE ---");

    if (!req.file) {
      return res.status(400).json({
        message: "No file uploaded"
      });
    }

    const userId = req.user ? req.user.id : null;
    const role = req.user ? req.user.role : null;

    let allowedRoles = ["admin"]; // Admin always has access

    // Extract payload preferences
    const payloadAllowIntern = req.body.allowIntern === "true";
    const payloadAllowStaff = req.body.allowStaff === "true";
    const payloadAllowSenior = req.body.allowSenior === "true";
    let sensitivityLevel = req.body.sensitivityLevel || "low";

    // Enforce Strict Matrix
    if (role === "intern") {
      // Intern: Forces all roles to have access. Forces sensitivity to low.
      allowedRoles.push("intern", "staff", "senior");
      sensitivityLevel = "low";
    } else if (role === "staff") {
      // Staff: Forces staff & senior. Optional intern. No critical.
      allowedRoles.push("staff", "senior");
      if (payloadAllowIntern) allowedRoles.push("intern");
      if (sensitivityLevel === "critical") sensitivityLevel = "high";
    } else if (role === "senior") {
      // Senior: Forces senior. Optional intern & staff. Any sensitivity.
      allowedRoles.push("senior");
      if (payloadAllowIntern) allowedRoles.push("intern");
      if (payloadAllowStaff) allowedRoles.push("staff");
    } else if (role === "admin" || role === "super_admin") {
      // Admin: Optional intern, staff, senior. Any sensitivity.
      if (payloadAllowIntern) allowedRoles.push("intern");
      if (payloadAllowStaff) allowedRoles.push("staff");
      if (payloadAllowSenior) allowedRoles.push("senior");
    }

    const user = await User.findByPk(userId);
    const departmentStr = user ? user.department : null;

    // Handle multi-department target
    let targetDepartments = ["All Departments"];
    if (req.body.targetDepartments) {
      try {
        targetDepartments = JSON.parse(req.body.targetDepartments);
      } catch (e) {
        targetDepartments = Array.isArray(req.body.targetDepartments) ? req.body.targetDepartments : [req.body.targetDepartments];
      }
    } else if (req.body.targetDepartment) {
      targetDepartments = [req.body.targetDepartment];
    }

    // Create file
    const createdFile = await File.create({
      filename: req.file.filename,
      originalName: req.file.originalname,
      path: req.file.path,
      uploadedBy: userId,
      allowedRoles,
      sensitivityLevel,
      department: departmentStr,
      target_department: targetDepartments
    });

    const file = await File.findByPk(createdFile.id, {
      include: [
        {
          model: User,
          attributes: ["id", "email", "role"]
        }
      ]
    });

    // [C3] Compute dynamic risk score for this upload action
    const uploadRisk = await computeRisk({
      userId,
      action: "file_upload",
      sensitivityLevel: sensitivityLevel,
      userRole:        role,
      userDepartment:  departmentStr,
      fileDepartment:  targetDepartments,
      ipAddress:       req.ip
    });

    // Log action
    await ActivityLog.create({
      userId,
      action: "file_upload",
      fileId: createdFile.id,
      department: departmentStr,
      resource: req.file.filename,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      riskScore: uploadRisk.riskScore,
      decision: uploadRisk.decision
    });

    res.status(201).json({
      message: "File uploaded successfully",
      file
    });

  } catch (error) {

    console.error("Upload error:", error);

    res.status(500).json({
      message: "File upload failed",
      error: error.message,
      stack: error.stack
    });

  }
};

// Get all files (admin only)
exports.getAllFiles = async (req, res) => {
  try {
    // Check if admin
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ message: "Access denied. Admins only." });
    }

    const { timeRange, startDate, endDate, department, searchEmail } = req.query;
    const { Op } = require("sequelize");

    let dateFilter = null;
    const now = new Date();

    if (timeRange) {
      if (timeRange === "24_hours") {
        dateFilter = { [Op.gte]: new Date(now.getTime() - 24 * 60 * 60 * 1000) };
      } else if (timeRange === "7_days") {
        dateFilter = { [Op.gte]: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
      } else if (timeRange === "3_months") {
        dateFilter = { [Op.gte]: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) };
      } else if (timeRange === "1_year") {
        dateFilter = { [Op.gte]: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000) };
      } else if (timeRange === "custom" && startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter = { [Op.between]: [start, end] };
      }
    }

    const baseConditions = [];
    if (dateFilter) baseConditions.push({ createdAt: dateFilter });

    if (department) {
      baseConditions.push({
        [Op.or]: [
          { department: department },
          { '$User.department$': department }
        ]
      });
    }

    const whereClause = baseConditions.length > 0 ? { [Op.and]: baseConditions } : {};

    const includeUser = {
      model: User,
      attributes: ["id", "email", "name", "role", "department"]
    };

    if (searchEmail) {
      includeUser.where = { email: { [Op.like]: `%${searchEmail}%` } };
      includeUser.required = true;
    }

    const files = await File.findAll({
      where: whereClause,
      include: [includeUser],
      order: [["createdAt", "DESC"]]
    });

    res.status(200).json({
      message: "Files fetched successfully",
      files
    });
  } catch (error) {
    console.error("Fetch all files error:", error);
    res.status(500).json({
      message: "Failed to fetch files"
    });
  }
};

exports.getMyFiles = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const userDept = user.department;
    const userRole = user.role;

    // If user has no department assigned, return empty list gracefully
    if (!userDept) {
      return res.status(200).json({ message: "Files fetched successfully", files: [] });
    }

    const files = await File.findAll({
      include: [
        {
          model: User,
          attributes: ["id", "email", "role"]
        }
      ],
      order: [["createdAt", "DESC"]]
    });

    // Filter in JS for robustness across DB engines (JSON logic)
    const filteredFiles = files.filter(f => {
      const targets = f.target_department;
      if (!targets || !Array.isArray(targets)) return true; // Fallback
      return targets.includes("All Departments") || targets.includes(userDept);
    });

    const now = new Date();
    const fileIds = filteredFiles.map(f => f.id);
    let tempAccesses = [];
    
    if (fileIds.length > 0) {
      tempAccesses = await TemporaryAccess.findAll({
        where: {
          userId,
          fileId: { [Op.in]: fileIds },
          expiresAt: { [Op.gt]: now }
        }
      });
    }

    const tempAccessMap = new Set(tempAccesses.map(ta => ta.fileId));

    const enrichedFiles = filteredFiles.map(f => {
      let canView = false;
      let canDownload = false;

      // Priority 1: Admin
      if (userRole === "admin" || userRole === "super_admin") {
        canView = true;
        canDownload = true;
      } 
      // Priority 2: Role-based access
      else if (f.allowedRoles && f.allowedRoles.includes(userRole)) {
        canView = true;
        canDownload = true;
      }

      const tempAccess = tempAccesses.find(ta => ta.fileId === f.id);
      if (tempAccess) {
        canView = canView || tempAccess.canView;
        canDownload = canDownload || tempAccess.canDownload;
      }

      return {
        ...f.toJSON(),
        canView,
        canDownload
      };
    });

    res.status(200).json({
      message: "Files fetched successfully",
      files: enrichedFiles
    });

  } catch (error) {
    console.error("Fetch files error:", error);
    res.status(500).json({ message: "Failed to fetch files", error: error.message, stack: error.stack });
  }
};

// Download File
exports.downloadFile = async (req, res) => {
  try {
    const fileId = req.params.id;
    const userId = req.user.id;
    const mfaPin = req.headers["x-mfa-pin"];

    const user = await User.findByPk(userId);
    const file = await File.findByPk(fileId);

    if (!file || !user) {
      return res.status(404).json({ message: "Not found" });
    }

    if (user.mfaEnabled) {
      const mfaToken = req.headers["x-mfa-pin"]; // header name kept for frontend compat; value is now a 6-digit TOTP token
      if (!mfaToken) {
        return res.status(403).json({ mfaRequired: true, message: "Authenticator code required for download." });
      }
      // [H1] Verify against TOTP secret (replaces bcrypt PIN check)
      const isValid = user.mfaSecret && speakeasy.totp.verify({
        secret:   user.mfaSecret,
        encoding: "base32",
        token:    mfaToken,
        window:   1
      });
      if (!isValid) {
        return res.status(403).json({ mfaRequired: true, message: "Invalid or expired authenticator code." });
      }
    }

    let canDownload = false;
    const userRole = user.role;

    if (userRole === "admin" || userRole === "super_admin") {
      canDownload = true;
    } else if (file.allowedRoles && file.allowedRoles.includes(userRole)) {
      canDownload = true;
    }

    if (!canDownload) {
      const tempAccess = await TemporaryAccess.findOne({
        where: {
          userId,
          fileId,
          expiresAt: { [Op.gt]: new Date() },
          canDownload: true
        }
      });
      if (tempAccess) canDownload = true;
    }

    if (!canDownload) {
      return res.status(403).json({ message: "Access denied for downloading" });
    }

    // [C3] Compute dynamic risk score for this download action
    const downloadRisk = await computeRisk({
      userId,
      action:          "file_download",
      sensitivityLevel: file.sensitivityLevel,
      userRole:         userRole,
      userDepartment:   user.department,
      fileDepartment:   file.target_department,
      ipAddress:        req.ip
    });

    // Log action
    await ActivityLog.create({
      userId,
      action: "file_download",
      fileId,
      department: user.department,
      resource: file.filename,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      riskScore: downloadRisk.riskScore,
      decision: downloadRisk.decision
    });

    // Handle relative or absolute paths appropriately
    let filePath = file.path;
    if (!path.isAbsolute(filePath)) {
      filePath = path.join(__dirname, "..", filePath);
    }
    
    res.download(filePath, file.originalName || file.filename);

  } catch (error) {
    console.error("Download error:", error);
    res.status(500).json({ message: "Download failed" });
  }
};

// Request Access
exports.requestAccess = async (req, res) => {
  try {
    const { fileId, reason } = req.body;
    const userId = req.user.id;
    
    const user = await User.findByPk(userId);
    const file = await File.findByPk(fileId);

    if (!file) return res.status(404).json({ message: "File not found" });

    // Ensure user doesn't already have direct access
    if (user.role === "admin" || user.role === "super_admin" || (file.allowedRoles && file.allowedRoles.includes(user.role))) {
      return res.status(400).json({ message: "Already has access" });
    }

    const existingRequest = await AccessRequest.findOne({ where: { userId, fileId, status: "pending" } });
    if (existingRequest) {
      return res.status(400).json({ message: "Request already pending for this file" });
    }

    await AccessRequest.create({
      userId,
      fileId,
      reason,
      status: "pending"
    });

    // [C3] Compute dynamic risk score for access request
    const reqRisk = await computeRisk({
      userId,
      action:          "access_request",
      sensitivityLevel: file.sensitivityLevel,
      userRole:         user.role,
      userDepartment:   user.department,
      fileDepartment:   file.target_department,
      ipAddress:        req.ip
    });

    await ActivityLog.create({
      userId,
      action: "access_request",
      fileId,
      department: user ? user.department : null,
      resource: fileId.toString(),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      riskScore: reqRisk.riskScore,
      decision: reqRisk.decision
    });

    res.status(201).json({ message: "Access requested successfully" });
  } catch (error) {
    console.error("Request access error:", error);
    res.status(500).json({ message: "Request failed" });
  }
};

// View File
// ... (keep your imports at the top)

exports.viewFile = async (req, res) => {
  try {
    const fileId = req.params.id;
    const userId = req.user.id;
    const mfaPin = req.headers["x-mfa-pin"];

    const user = await User.findByPk(userId);
    const file = await File.findByPk(fileId);

    if (!file || !user) return res.status(404).json({ message: "Not found" });

    // MFA Check
    if (user.mfaEnabled) {
      const mfaToken = req.headers["x-mfa-pin"]; // header name kept for frontend compat; value is now 6-digit TOTP
      if (!mfaToken) return res.status(403).json({ mfaRequired: true, message: "Authenticator code required." });
      // [H1] Verify TOTP
      const isValid = user.mfaSecret && speakeasy.totp.verify({
        secret:   user.mfaSecret,
        encoding: "base32",
        token:    mfaToken,
        window:   1
      });
      if (!isValid) return res.status(403).json({ mfaRequired: true, message: "Invalid or expired authenticator code." });
    }

    // Access Control Logic
    let canView = (user.role === "admin" || user.role === "super_admin" || (file.allowedRoles && file.allowedRoles.includes(user.role)));

    if (!canView) {
      const tempAccess = await TemporaryAccess.findOne({
        where: { userId, fileId, expiresAt: { [Op.gt]: new Date() }, canView: true }
      });
      if (tempAccess) canView = true;
    }

    if (!canView) return res.status(403).json({ message: "Access denied" });

    // [C3] Compute dynamic risk score for this view action
    const viewRisk = await computeRisk({
      userId,
      action:          "file_view",
      sensitivityLevel: file.sensitivityLevel,
      userRole:         user.role,
      userDepartment:   user.department,
      fileDepartment:   file.target_department,
      ipAddress:        req.ip
    });

    // Log the view action
    await ActivityLog.create({
      userId,
      action: "file_view",
      fileId,
      department: user.department,
      resource: file.filename,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      riskScore: viewRisk.riskScore,
      decision: viewRisk.decision
    });

    let filePath = file.path;
    if (!path.isAbsolute(filePath)) {
      filePath = path.join(__dirname, "..", filePath);
    }

    // THE FIX: Set headers before sending
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="' + file.originalName + '"');
    
    res.sendFile(filePath);

  } catch (error) {
    console.error("View error:", error);
    res.status(500).json({ message: "Viewing failed" });
  }
};

// Delete File (Admin only)
exports.deleteFile = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const file = await File.findByPk(id);
    if (!file) return res.status(404).json({ message: "File not found" });

    // 0. Cleanup related records manually to avoid ForeignKeyConstraintErrors
    // (Manual CASCADE instead of DB-level trigger)
    await AccessRequest.destroy({ where: { fileId: id } });
    await TemporaryAccess.destroy({ where: { fileId: id } });

    const filename = file.filename;
    // Specifically target the uploads directory. Note: controller is in backend/controllers
    const filePath = path.join(__dirname, "..", "..", "uploads", filename);
    
    // 1. Delete physical file first
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[STORAGE] Physically deleted: ${filename}`);
      } else {
        console.warn(`[STORAGE] File missing on disk: ${filename}. Proceeding to DB removal.`);
      }
    } catch (err) {
      console.error(`[STORAGE] Error unlinking file: ${err.message}`);
    }

    // 2. Log Action
    await ActivityLog.create({
      userId,
      action: "FILE_DELETE",
      resource: `File [${file.originalName || filename}] deleted by Admin`,
      ipAddress: req.ip
    });

    // 3. Delete from DB (Always)
    await file.destroy();

    res.json({ message: "File deleted successfully" });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ message: "Deletion failed" });
  }
};

// Update File Permissions (Admin Override)
exports.updateFilePermissions = async (req, res) => {
  try {
    const { id } = req.params;
    const { targetDepartments, allowedRoles } = req.body;
    const userId = req.user.id;

    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const file = await File.findByPk(id);
    if (!file) return res.status(404).json({ message: "File not found" });

    // Update
    if (targetDepartments) file.target_department = targetDepartments;
    if (allowedRoles) file.allowedRoles = allowedRoles;

    await file.save();

    // Log Action
    await ActivityLog.create({
      userId,
      action: "FILE_PERM_UPDATE",
      resource: `Admin modified permissions for file [${file.originalName || file.filename}]`,
      ipAddress: req.ip
    });

    res.json({ message: "Permissions updated successfully", file });
  } catch (error) {
    console.error("Update permissions error:", error);
    res.status(500).json({ message: "Update failed" });
  }
};
