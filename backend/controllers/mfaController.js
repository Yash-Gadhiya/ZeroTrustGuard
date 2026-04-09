const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
const User = require("../models/User");
const MfaChangeRequest = require("../models/MfaChangeRequest");

exports.setPin = async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ message: "PIN must be exactly 4 digits" });
    }

    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const hashedPin = await bcrypt.hash(pin, 10);
    user.mfaPin = hashedPin;
    user.mfaEnabled = true;
    await user.save();

    res.status(200).json({ message: "MFA PIN setup successfully" });
  } catch (error) {
    console.error("Set PIN error:", error);
    res.status(500).json({ message: "Failed to set PIN" });
  }
};

exports.verifyPin = async (req, res) => {
  try {
    const { pin } = req.body;
    const user = await User.findByPk(req.user.id);

    if (!user || (!user.mfaEnabled && req.user.mfaPending)) {
      return res.status(400).json({ message: "MFA not enabled or User not found" }); 
    }

    // Check lock
    const now = new Date();
    if (user.mfaLockUntil && user.mfaLockUntil > now) {
      return res.status(403).json({ message: "MFA locked due to too many failed attempts. Try again later." });
    }

    const isValid = await bcrypt.compare(pin, user.mfaPin);
    if (!isValid) {
      user.mfaFailedAttempts += 1;
      if (user.mfaFailedAttempts >= 5) {
        user.mfaLockUntil = new Date(now.getTime() + 5 * 60 * 1000); // 5 mins
      }
      await user.save();
      return res.status(401).json({ message: "Invalid PIN" });
    }

    // Success
    user.mfaFailedAttempts = 0;
    user.mfaLockUntil = null;
    await user.save();

    // If this is a login completion step (mfaPending is true in token), return full JWT
    if (req.user.mfaPending) {
        const token = jwt.sign(
          { id: user.id, role: user.role },
          process.env.JWT_SECRET,
          { expiresIn: "2h" }
        );
        return res.status(200).json({ message: "Verification successful", token, role: user.role });
    }

    res.status(200).json({ message: "PIN verified" });

  } catch (error) {
    console.error("Verify PIN error:", error);
    res.status(500).json({ message: "Failed to verify PIN" });
  }
};

exports.requestChange = async (req, res) => {
  try {
    const userId = req.user.id;
    const existing = await MfaChangeRequest.findOne({ where: { userId, status: "pending" } });
    if (existing) {
      return res.status(400).json({ message: "A request is already pending." });
    }

    await MfaChangeRequest.create({ userId, status: "pending" });
    res.status(201).json({ message: "Change request submitted to admin." });
  } catch (error) {
    console.error("Request change error:", error);
    res.status(500).json({ message: "Failed to request PIN change" });
  }
};

exports.approveChange = async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ message: "Admins only" });
    }
    const { id } = req.params;
    const request = await MfaChangeRequest.findByPk(id);
    if (!request) return res.status(404).json({ message: "Request not found" });

    request.status = "approved";
    request.approvedBy = req.user.id;
    await request.save();

    const user = await User.findByPk(request.userId);
    if (user) {
      user.mfaPin = null;
      user.mfaEnabled = false;
      await user.save();
    }

    res.status(200).json({ message: "Request approved and MFA reset for user." });
  } catch (error) {
    console.error("Approve change error:", error);
    res.status(500).json({ message: "Failed to approve request" });
  }
};

exports.rejectChange = async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ message: "Admins only" });
    }
    const { id } = req.params;
    const request = await MfaChangeRequest.findByPk(id);
    if (!request) return res.status(404).json({ message: "Request not found" });

    request.status = "rejected";
    request.approvedBy = req.user.id;
    await request.save();

    res.status(200).json({ message: "Request rejected." });
  } catch (error) {
    console.error("Reject change error:", error);
    res.status(500).json({ message: "Failed to reject request" });
  }
};

exports.updatePin = async (req, res) => {
  try {
    const { oldPin, newPin } = req.body;
    if (!newPin || newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
      return res.status(400).json({ message: "New PIN must be exactly 4 digits" });
    }

    const user = await User.findByPk(req.user.id);
    
    if (user.mfaPin) {
        const isValid = await bcrypt.compare(oldPin, user.mfaPin);
        if (!isValid) return res.status(401).json({ message: "Invalid old PIN" });
    }

    const hashedPin = await bcrypt.hash(newPin, 10);
    user.mfaPin = hashedPin;
    user.mfaEnabled = true;
    await user.save();

    res.status(200).json({ message: "PIN updated successfully" });
  } catch (error) {
    console.error("Update PIN error:", error);
    res.status(500).json({ message: "Failed to update PIN" });
  }
};

exports.getPendingRequests = async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ message: "Admins only" });
    }
    const requests = await MfaChangeRequest.findAll({
      where: { status: "pending" },
      include: [{ model: User, attributes: ["id", "email", "name"] }]
    });
    res.status(200).json(requests);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch requests" });
  }
};
