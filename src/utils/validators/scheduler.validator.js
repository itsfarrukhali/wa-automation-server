import { body, query, validationResult } from "express-validator";
import ApiResponseUtil from "../helpers/apiResponse.utils.js";

const TYPES = ["all", "reminder", "follow_up"];

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

export const dueSchedulerValidator = [
  query("type").optional().isIn(TYPES).withMessage("Invalid scheduler type"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100"),
];

export const runSchedulerValidator = [
  body("type").optional().isIn(TYPES).withMessage("Invalid scheduler type"),
  body("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100"),
  body("dryRun")
    .optional()
    .isBoolean()
    .withMessage("dryRun must be a boolean"),
];
