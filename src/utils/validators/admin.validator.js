/**
 * utils/validators/admin.validator.js
 *
 * express-validator chains for the admin module.
 * Pattern matches auth.validator.js and business.validator.js exactly.
 */

import { body, param, query } from "express-validator";
import { validationResult } from "express-validator";
import ApiResponseUtil from "../helpers/apiResponse.utils.js";

// ─── Shared validate middleware ────────────────────────────────────────────────

export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return ApiResponseUtil.error(
      res,
      "Validation failed",
      422,
      errors.array().map((e) => ({ field: e.path, message: e.msg })),
    );
  }
  next();
};

// ─── Shared constants ─────────────────────────────────────────────────────────

const ALL_ROLES = ["superadmin", "admin", "owner", "staff"];
const VALID_PLANS = ["free", "starter", "growth", "enterprise"];
const VALID_PAYMENT_METHODS = [
  "jazzcash",
  "easypaisa",
  "card",
  "bank_transfer",
  "manual",
  "none",
];

// ─── Query validators ─────────────────────────────────────────────────────────

export const listUsersValidator = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("page must be a positive integer"),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100"),

  query("role")
    .optional()
    .isIn(ALL_ROLES)
    .withMessage(`role must be one of: ${ALL_ROLES.join(", ")}`),

  query("isActive")
    .optional()
    .isIn(["true", "false"])
    .withMessage("isActive must be true or false"),

  query("isEmailVerified")
    .optional()
    .isIn(["true", "false"])
    .withMessage("isEmailVerified must be true or false"),

  query("search")
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("search must be between 1 and 100 characters"),
];

export const listBusinessesValidator = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("page must be a positive integer"),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100"),

  query("isActive")
    .optional()
    .isIn(["true", "false"])
    .withMessage("isActive must be true or false"),

  query("onboardingComplete")
    .optional()
    .isIn(["true", "false"])
    .withMessage("onboardingComplete must be true or false"),

  query("search")
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("search must be between 1 and 100 characters"),
];

export const listAdminsValidator = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("page must be a positive integer"),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100"),
];

// ─── Param validators ─────────────────────────────────────────────────────────

export const userIdParamValidator = [
  param("userId")
    .isMongoId()
    .withMessage("userId must be a valid MongoDB ObjectId"),
];

export const businessIdParamValidator = [
  param("businessId")
    .isMongoId()
    .withMessage("businessId must be a valid MongoDB ObjectId"),
];

// ─── Body validators ──────────────────────────────────────────────────────────

export const setActiveStatusValidator = [
  body("isActive")
    .notEmpty()
    .withMessage("isActive is required")
    .isBoolean()
    .withMessage("isActive must be a boolean"),
];

export const changeRoleValidator = [
  body("role")
    .notEmpty()
    .withMessage("role is required")
    .isIn(ALL_ROLES)
    .withMessage(`role must be one of: ${ALL_ROLES.join(", ")}`),
];

export const createAdminValidator = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ max: 100 })
    .withMessage("Name cannot exceed 100 characters"),

  body("username")
    .trim()
    .notEmpty()
    .withMessage("Username is required")
    .isLength({ min: 3, max: 30 })
    .withMessage("Username must be between 3 and 30 characters")
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage("Username can only contain letters, numbers, and underscores"),

  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email address")
    .normalizeEmail(),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .matches(/[A-Z]/)
    .withMessage("Password must contain at least one uppercase letter")
    .matches(/[0-9]/)
    .withMessage("Password must contain at least one number"),
];

export const upgradePlanValidator = [
  body("newPlan")
    .notEmpty()
    .withMessage("newPlan is required")
    .isIn(VALID_PLANS)
    .withMessage(`newPlan must be one of: ${VALID_PLANS.join(", ")}`),

  body("paymentMethod")
    .optional()
    .isIn(VALID_PAYMENT_METHODS)
    .withMessage(
      `paymentMethod must be one of: ${VALID_PAYMENT_METHODS.join(", ")}`,
    ),
];

export const forceAdvanceOnboardingValidator = [
  body("step")
    .notEmpty()
    .withMessage("step is required")
    .isInt({ min: 1, max: 5 })
    .withMessage("step must be an integer between 1 and 5"),
];

export const setVerifiedValidator = [
  body("isVerified")
    .notEmpty()
    .withMessage("isVerified is required")
    .isBoolean()
    .withMessage("isVerified must be a boolean"),
];
