const jwt = require("jsonwebtoken");

function verifyToken(req, res, next) {

  try {

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(403).json({
        message: "Access denied. No token provided."
      });
    }

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Invalid authorization format"
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;

    next();

  } catch (error) {

    console.error("Token verification error:", error.message);

    return res.status(401).json({
      message: "Invalid or expired token"
    });

  }

}

module.exports = verifyToken;