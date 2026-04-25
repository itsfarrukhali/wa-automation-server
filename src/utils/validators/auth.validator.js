/**
 * utils/validators/auth.validator.js
 *
 * Input validation using express-validator.
 * Rules here mirror the User model constraints exactly so the
 * error is caught at the HTTP layer before touching the DB.
 *
 * Each exported array is used as route-level middleware:
 *   router.post("/register", registerValidator, validate, handler)
 */

import { body, validationResult } from "express-validator";
import ApiResponseUtil from "../helpers/apiResponse.utils.js";
import Category from "../../models/common/categorySchema.js";

// Generic Validation Runner

/**
 * Middleware that reads express-validator results and short-circuits
 * with a 422 if any rule failed. Place after validator arrays in route.
 */

export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const first = errors.array()[0];
    return ApiResponseUtil.error(res, first.msg, 422, {
      field: first.path,
      value: first.value,
    });
  }
  next();
};

// Register

export const registerValidator = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email format")
    .normalizeEmail(),

  body("username")
    .trim()
    .notEmpty()
    .withMessage("Username is required")
    .isLength({ min: 3 })
    .withMessage("Username must be at least 3 characters")
    .isLength({ max: 30 })
    .withMessage("Username cannot exceed 30 characters")
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage("Username can only contain letters, numbers, and underscores"),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .matches(/[A-Z]/)
    .withMessage("Password must contain at least one uppercase letter")
    .matches(/[a-z]/)
    .withMessage("Password must contain at least one lowercase letter")
    .matches(/\d/)
    .withMessage("Password must contain at least one number"),

  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ max: 100 })
    .withMessage("Name cannot exceed 100 characters"),

  body("businessName")
    .trim()
    .notEmpty()
    .withMessage("Business name is required")
    .isLength({ min: 2 })
    .withMessage("Business name must be at least 2 characters")
    .isLength({ max: 150 })
    .withMessage("Business name cannot exceed 150 characters"),

  body("businessType")
    .trim()
    .notEmpty()
    .withMessage("Business type is required")
    .custom(async (val) => {
      const category = await Category.findOne({ name: val, isActive: true });
      if (!category) {
        throw new Error("Invalid business type");
      }
      return true;
    }),

  body("consentToDataProcessing")
    .notEmpty()
    .withMessage("You must provide consent to data processing")
    .isBoolean()
    .withMessage("consentToDataProcessing must be a boolean")
    .custom((val) => {
      if (val !== true && val !== "true") {
        throw new Error("You must consent to data processing to register");
      }
      return true;
    }),
];

// Login

export const loginValidator = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email format")
    .normalizeEmail(),

  body("password").notEmpty().withMessage("Password is required"),
];

// Forgot Password

export const forgotPasswordValidator = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email format")
    .normalizeEmail(),
];

// Reset Password

export const resetPasswordValidator = [
  body("token").trim().notEmpty().withMessage("Reset token is required"),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .matches(/[A-Z]/)
    .withMessage("Password must contain at least one uppercase letter")
    .matches(/[a-z]/)
    .withMessage("Password must contain at least one lowercase letter")
    .matches(/\d/)
    .withMessage("Password must contain at least one number"),

  body("confirmPassword")
    .notEmpty()
    .withMessage("Please confirm your password")
    .custom((val, { req }) => {
      if (val !== req.body.password) {
        throw new Error("Passwords do not match");
      }
      return true;
    }),
];

// Change Password (authenticated)

export const changePasswordValidator = [
  body("currentPassword")
    .notEmpty()
    .withMessage("Current password is required"),

  body("newPassword")
    .notEmpty()
    .withMessage("New password is required")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .matches(/[A-Z]/)
    .withMessage("Password must contain at least one uppercase letter")
    .matches(/[a-z]/)
    .withMessage("Password must contain at least one lowercase letter")
    .matches(/\d/)
    .withMessage("Password must contain at least one number")
    .custom((val, { req }) => {
      if (val === req.body.currentPassword) {
        throw new Error("New password must be different from current password");
      }
      return true;
    }),

  body("confirmPassword")
    .notEmpty()
    .withMessage("Please confirm your new password")
    .custom((val, { req }) => {
      if (val !== req.body.newPassword) {
        throw new Error("Passwords do not match");
      }
      return true;
    }),
];
