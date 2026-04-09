const jwt = require("jsonwebtoken");
require("dotenv").config();

// Generate a dummy admin token
const token = jwt.sign({ id: 1, role: "admin" }, process.env.JWT_SECRET, { expiresIn: "10h" });
console.log(token);
