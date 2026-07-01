import { body, param, query, validationResult } from "express-validator";
import ApiResponseUtil from "../helpers/apiResponse.utils.js";

export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return ApiResponseUtil.error(
      res,
      "Validation failed",
      422,
      errors.array().map((error) => ({
        field: error.path,
        message: error.msg,
      })),
    );
  }
  next();
};

export const staffIdValidator = [
  param("staffId").isMongoId().withMessage("staffId must be valid"),
];

export const listStaffValidator = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("page must be at least 1"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100"),
  query("isActive")
    .optional()
    .isBoolean()
    .withMessage("isActive must be boolean"),
  query("search")
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("search must be between 1 and 100 characters"),
];

export const createStaffValidator = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("name is required")
    .isLength({ max: 100 })
    .withMessage("name cannot exceed 100 characters"),
  body("email").isEmail().normalizeEmail().withMessage("Valid email is required"),
  body("username")
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage("username must be 3-30 characters")
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage("username can only contain letters, numbers, and underscores"),
  body("password")
    .isLength({ min: 8 })
    .withMessage("password must be at least 8 characters")
    .matches(/[A-Z]/)
    .withMessage("password must contain an uppercase letter")
    .matches(/[0-9]/)
    .withMessage("password must contain a number"),
  body("phone")
    .optional()
    .trim()
    .isLength({ max: 30 })
    .withMessage("phone cannot exceed 30 characters"),
  body("isEmailVerified")
    .optional()
    .isBoolean()
    .withMessage("isEmailVerified must be boolean"),
];

export const updateStaffValidator = [
  ...staffIdValidator,
  body("name")
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("name must be between 1 and 100 characters"),
  body("email").optional().isEmail().normalizeEmail().withMessage("Invalid email"),
  body("username")
    .optional()
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage("username must be 3-30 characters")
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage("username can only contain letters, numbers, and underscores"),
  body("phone")
    .optional()
    .trim()
    .isLength({ max: 30 })
    .withMessage("phone cannot exceed 30 characters"),
  body("profilePicture")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("profilePicture cannot exceed 500 characters"),
];

export const staffStatusValidator = [
  ...staffIdValidator,
  body("isActive").isBoolean().withMessage("isActive must be boolean"),
];

export const resetStaffPasswordValidator = [
  ...staffIdValidator,
  body("password")
    .isLength({ min: 8 })
    .withMessage("password must be at least 8 characters")
    .matches(/[A-Z]/)
    .withMessage("password must contain an uppercase letter")
    .matches(/[0-9]/)
    .withMessage("password must contain a number"),
];
