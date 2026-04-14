/**
 * errorHandler.js
 *
 * Centralized Express error-handling middleware.
 * Must be registered LAST in server.js (after all routes).
 *
 * Usage in controllers: next(err) or next(new Error('msg'))
 * To send a specific HTTP status: err.status = 404; next(err);
 */

"use strict";

module.exports = (err, req, res, next) => {
  const status  = err.status || err.statusCode || 500;
  const message = err.message || "Internal server error";

  // Never leak stack traces to clients in production
  if (process.env.NODE_ENV !== "production") {
    console.error(`[ERROR] ${req.method} ${req.originalUrl} → ${status}: ${message}`);
    if (err.stack) console.error(err.stack);
  } else {
    console.error(`[ERROR] ${status}: ${message}`);
  }

  res.status(status).json({ message });
};
