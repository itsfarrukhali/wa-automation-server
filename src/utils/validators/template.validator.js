import { body, param, query, validationResult } from "express-validator";
import ApiResponseUtil from "../helpers/apiResponse.utils.js";

const CATEGORIES = [
  "UTILITY",
  "MARKETING",
  "AUTHENTICATION",
  "ALERT_UPDATE",
  "TRANSACTIONAL",
  "OTP",
  "OTHER",
];

const STATUSES = ["PENDING", "APPROVED", "REJECTED", "DISABLED"];

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

export const listTemplatesValidator = [
  query("status").optional().isIn(STATUSES).withMessage("Invalid status"),
  query("category").optional().isIn(CATEGORIES).withMessage("Invalid category"),
  query("language")
    .optional()
    .trim()
    .isLength({ min: 2, max: 10 })
    .withMessage("language must be between 2 and 10 characters"),
  query("search")
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("search must be between 1 and 100 characters"),
];

export const templateIdValidator = [
  param("templateId").isMongoId().withMessage("templateId must be valid"),
];

export const createTemplateValidator = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("name is required")
    .isLength({ max: 512 })
    .withMessage("name cannot exceed 512 characters")
    .matches(/^[a-zA-Z0-9_\s-]+$/)
    .withMessage("name can contain letters, numbers, spaces, hyphens and underscores"),
  body("language")
    .optional()
    .trim()
    .isLength({ min: 2, max: 10 })
    .withMessage("language must be between 2 and 10 characters"),
  body("category").optional().isIn(CATEGORIES).withMessage("Invalid category"),
  body("status").optional().isIn(STATUSES).withMessage("Invalid status"),
  body("components")
    .optional()
    .isArray()
    .withMessage("components must be an array"),
];

export const updateTemplateValidator = [
  ...templateIdValidator,
  body("name")
    .optional()
    .trim()
    .isLength({ min: 1, max: 512 })
    .withMessage("name must be between 1 and 512 characters")
    .matches(/^[a-zA-Z0-9_\s-]+$/)
    .withMessage("name can contain letters, numbers, spaces, hyphens and underscores"),
  body("language")
    .optional()
    .trim()
    .isLength({ min: 2, max: 10 })
    .withMessage("language must be between 2 and 10 characters"),
  body("category").optional().isIn(CATEGORIES).withMessage("Invalid category"),
  body("status").optional().isIn(STATUSES).withMessage("Invalid status"),
  body("components")
    .optional()
    .isArray()
    .withMessage("components must be an array"),
];
