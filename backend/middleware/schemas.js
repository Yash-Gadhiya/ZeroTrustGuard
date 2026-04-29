/**
 * schemas.js
 *
 * Centralised Zod schemas for all validated endpoints.
 * Import the specific schema you need in each route file.
 */

"use strict";

const { z } = require("zod");

// ── Auth ──────────────────────────────────────────────────────────────────────

const DEPARTMENTS = ["IT", "HR", "ACCOUNTS", "MARKETING", "OPERATIONS"];
const DESIGNATION_LEVELS = ["junior", "mid", "senior", "lead", "director"];

exports.registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be at most 100 characters")
    .optional(),

  email: z
    .string({ required_error: "Email is required" })
    .trim()
    .toLowerCase()
    .email("Invalid email format"),

  password: z
    .string({ required_error: "Password is required" })
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),

  department: z
    .enum(DEPARTMENTS, {
      errorMap: () => ({ message: `Department must be one of: ${DEPARTMENTS.join(", ")}` }),
    }),

  designation: z
    .string()
    .trim()
    .max(100)
    .optional(),

  designation_level: z
    .number()
    .int()
    .optional(),
    
  role: z
    .string()
    .optional(),
});

exports.loginSchema = z.object({
  email: z
    .string({ required_error: "Email is required" })
    .trim()
    .toLowerCase()
    .email("Invalid email format"),

  password: z
    .string({ required_error: "Password is required" })
    .min(1, "Password is required"),
});

// ── File Upload ───────────────────────────────────────────────────────────────

const SENSITIVITY_LEVELS = ["low", "medium", "high", "critical"];

exports.uploadFileSchema = z.object({
  sensitivityLevel: z
    .enum(SENSITIVITY_LEVELS, {
      errorMap: () => ({ message: `Sensitivity level must be one of: ${SENSITIVITY_LEVELS.join(", ")}` }),
    })
    .optional()
    .default("low"),

  target_department: z
    .string()
    .trim()
    .max(200, "Target department string too long")
    .optional(),

  allowedRoles: z
    .string()
    .trim()
    .optional(),
});

// ── Access Requests ───────────────────────────────────────────────────────────

exports.accessRequestSchema = z.object({
  fileId: z
    .union([z.number().int().positive(), z.string().regex(/^\d+$/).transform(Number)], {
      errorMap: () => ({ message: "fileId must be a positive integer" }),
    }),

  reason: z
    .string({ required_error: "Reason is required" })
    .trim()
    .min(10, "Reason must be at least 10 characters")
    .max(500, "Reason must be at most 500 characters"),
});

exports.approveRequestSchema = z.object({
  duration: z
    .enum(["30_minutes", "1_hour", "2_hours", "1_day"], {
      errorMap: () => ({ message: "Duration must be one of: 30_minutes, 1_hour, 2_hours, 1_day" }),
    })
    .optional()
    .default("1_hour"),

  allowDownload: z
    .boolean()
    .optional()
    .default(false),
});

exports.rejectRequestSchema = z.object({
  reason: z
    .string({ required_error: "Rejection reason is required" })
    .trim()
    .min(5, "Reason must be at least 5 characters")
    .max(500, "Reason must be at most 500 characters"),
});
