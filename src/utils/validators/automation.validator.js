import { body, param, query, validationResult } from "express-validator";
import ApiResponseUtil from "../helpers/apiResponse.utils.js";

const TRIGGER_TYPES = [
  "contains_any",
  "contains_all",
  "exact_match",
  "starts_with",
];

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

const optionalRuleFields = [
  body("description")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("description cannot exceed 500 characters"),
  body("isActive")
    .optional()
    .isBoolean()
    .withMessage("isActive must be a boolean"),
  body("priority")
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage("priority must be between 1 and 1000"),
  body("trigger.type")
    .optional()
    .isIn(TRIGGER_TYPES)
    .withMessage("Invalid trigger type"),
  body("trigger.keywords")
    .optional()
    .isArray({ min: 1, max: 20 })
    .withMessage("trigger.keywords must contain 1 to 20 values"),
  body("trigger.keywords.*")
    .optional()
    .trim()
    .isLength({ min: 1, max: 80 })
    .withMessage("Each keyword must be between 1 and 80 characters"),
  body("trigger.matchCase")
    .optional()
    .isBoolean()
    .withMessage("trigger.matchCase must be a boolean"),
  body("response.text")
    .optional()
    .trim()
    .isLength({ min: 1, max: 4096 })
    .withMessage("response.text must be between 1 and 4096 characters"),
  body("stopProcessing")
    .optional()
    .isBoolean()
    .withMessage("stopProcessing must be a boolean"),
];

export const createAutomationRuleValidator = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("name is required")
    .isLength({ max: 120 })
    .withMessage("name cannot exceed 120 characters"),
  body("trigger.keywords")
    .isArray({ min: 1, max: 20 })
    .withMessage("trigger.keywords must contain 1 to 20 values"),
  body("response.text")
    .trim()
    .notEmpty()
    .withMessage("response.text is required")
    .isLength({ max: 4096 })
    .withMessage("response.text cannot exceed 4096 characters"),
  ...optionalRuleFields,
];

export const updateAutomationRuleValidator = [
  body("name")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("name cannot be empty")
    .isLength({ max: 120 })
    .withMessage("name cannot exceed 120 characters"),
  ...optionalRuleFields,
];

export const listAutomationRulesValidator = [
  query("page").optional().isInt({ min: 1 }).withMessage("page must be at least 1"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100"),
  query("isActive")
    .optional()
    .isBoolean()
    .withMessage("isActive must be true or false"),
];

export const ruleIdValidator = [
  param("ruleId").isMongoId().withMessage("ruleId must be valid"),
];
