const AccessRequest = require("../models/AccessRequest");
const TemporaryAccess = require("../models/TemporaryAccess");
const ActivityLog = require("../models/ActivityLog");
const User = require("../models/User");
const File = require("../models/File");
// [C3] Risk Engine
const { computeRisk } = require("../services/riskEngine");

// getPendingRequests
exports.getPendingRequests = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    if (userRole === "intern") {
      return res.status(403).json({ message: "Interns cannot approve requests" });
    }

    let allowedRequesterRoles = [];
    if (userRole === "staff") allowedRequesterRoles = ["intern"];
    else if (userRole === "senior") allowedRequesterRoles = ["intern", "staff"];
    else if (userRole === "admin") allowedRequesterRoles = ["intern", "staff", "senior", "admin"];

    const pendingRequests = await AccessRequest.findAll({
      where: { status: "pending" },
      include: [
        {
          model: User,
          as: "Requester",
          where: { role: allowedRequesterRoles },
          attributes: ["id", "name", "email", "role"]
        },
        {
          model: File,
          attributes: ["id", "filename", "department"]
        }
      ],
      order: [["createdAt", "DESC"]]
    });

    res.status(200).json({ requests: pendingRequests });
  } catch (error) {
    console.error("Fetch pending requests error:", error);
    res.status(500).json({ message: "Failed to fetch pending requests" });
  }
};

// getMyRequests
exports.getMyRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    const myRequests = await AccessRequest.findAll({
      where: { userId },
      include: [
        {
          model: File,
          attributes: ["id", "filename", "department"]
        }
      ],
      order: [["createdAt", "DESC"]]
    });

    res.status(200).json({ requests: myRequests });
  } catch (error) {
    console.error("Fetch my requests error:", error);
    res.status(500).json({ message: "Failed to fetch my requests" });
  }
};

// approveRequest
exports.approveRequest = async (req, res) => {
  try {
    const requestId = req.params.id;
    const { duration, allowDownload } = req.body; // expected: "30_minutes", "2_hours", "1_day", allowDownload: boolean
    const approverId = req.user.id;

    const request = await AccessRequest.findByPk(requestId);
    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    if (request.status !== "pending") {
      return res.status(400).json({ message: "Request is not pending" });
    }

    let expiresAt = new Date();
    if (duration === "30_minutes") {
      expiresAt.setMinutes(expiresAt.getMinutes() + 30);
    } else if (duration === "2_hours") {
      expiresAt.setHours(expiresAt.getHours() + 2);
    } else if (duration === "1_day") {
      expiresAt.setDate(expiresAt.getDate() + 1);
    } else {
      expiresAt.setHours(expiresAt.getHours() + 1); // default 1 hour
    }

    request.status = "approved";
    request.approvedBy = approverId;
    request.expiresAt = expiresAt;
    await request.save();

    await TemporaryAccess.create({
      userId: request.userId,
      fileId: request.fileId,
      grantedBy: approverId,
      expiresAt: expiresAt,
      canView: true,
      canDownload: allowDownload === true
    });

    const targetUser = await User.findByPk(request.userId);
    const targetFile = await File.findByPk(request.fileId);

    // [C3] Dynamic risk score for access grant
    const grantRisk = await computeRisk({
      userId:          approverId,
      action:          "access_granted",
      sensitivityLevel: targetFile ? targetFile.sensitivityLevel : "low",
      userRole:         req.user.role,
      userDepartment:   req.user.department || null,
      fileDepartment:   targetFile ? targetFile.target_department : null,
      ipAddress:        req.ip
    });

    await ActivityLog.create({
      userId: approverId,
      action: "access_granted",
      fileId: request.fileId,
      department: targetUser ? targetUser.department : null,
      resource: request.fileId.toString(),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      riskScore: grantRisk.riskScore,
      decision: grantRisk.decision
    });

    res.status(200).json({ message: "Access request approved" });
  } catch (error) {
    console.error("Approve request error:", error);
    res.status(500).json({ message: "Failed to approve request" });
  }
};

// rejectRequest
exports.rejectRequest = async (req, res) => {
  try {
    const requestId = req.params.id;
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: "Rejection reason is required." });
    }
    const approverId = req.user.id;

    const request = await AccessRequest.findByPk(requestId);
    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    if (request.status !== "pending") {
      return res.status(400).json({ message: "Request is not pending" });
    }

    request.status = "rejected";
    request.approvedBy = approverId;
    request.admin_comment = reason.trim();
    await request.save();

    const targetUser = await User.findByPk(request.userId);
    const targetFile = await File.findByPk(request.fileId);

    // [C3] Dynamic risk score for access rejection
    const rejectRisk = await computeRisk({
      userId:          approverId,
      action:          "access_rejected",
      sensitivityLevel: targetFile ? targetFile.sensitivityLevel : "low",
      userRole:         req.user.role,
      userDepartment:   req.user.department || null,
      fileDepartment:   targetFile ? targetFile.target_department : null,
      ipAddress:        req.ip
    });

    await ActivityLog.create({
      userId: approverId,
      action: "access_rejected",
      fileId: request.fileId,
      department: targetUser ? targetUser.department : null,
      resource: request.fileId.toString(),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      riskScore: rejectRisk.riskScore,
      decision: rejectRisk.decision
    });

    res.status(200).json({ message: "Access request rejected" });
  } catch (error) {
    console.error("Reject request error:", error);
    res.status(500).json({ message: "Failed to reject request" });
  }
};
