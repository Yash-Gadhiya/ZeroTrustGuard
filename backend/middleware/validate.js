/**
 * validate.js
 *
 * Generic Zod validation middleware factory.
 *
 * Usage:
 *   const { validate } = require('../middleware/validate');
 *   const { z } = require('zod');
 *
 *   const mySchema = z.object({ ... });
 *   router.post('/route', validate(mySchema), controller);
 *
 * On failure: returns 400 with structured field-level error messages.
 * On success: populates req.validated with the parsed (coerced) body.
 */

"use strict";

const { z } = require("zod");

/**
 * @param {z.ZodSchema} schema - The Zod schema to validate req.body against
 * @param {"body"|"query"|"params"} [source="body"] - Which part of req to validate
 */
function validate(schema, source = "body") {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const errors = result.error.issues.map(issue => ({
        field:   issue.path.join("."),
        message: issue.message,
      }));

      return res.status(400).json({
        message: "Validation failed",
        errors,
      });
    }

    // Attach parsed (coerced + trimmed) data to req for controllers to use
    req.validated = result.data;
    next();
  };
}

module.exports = { validate, z };
