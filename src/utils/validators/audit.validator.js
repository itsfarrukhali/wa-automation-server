import { query, validationResult } from "express-validator";
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

export const listAuditLogsValidator = [
  query("page").optional().isInt({ min: 1 }).withMessage("page must be at least 1"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 200 })
    .withMessage("limit must be between 1 and 200"),
  query("actorId").optional().isMongoId().withMessage("Invalid actorId"),
  query("businessId").optional().isMongoId().withMessage("Invalid businessId"),
  query("action")
    .optional()
    .trim()
    .isLength({ min: 1, max: 120 })
    .withMessage("action must be between 1 and 120 characters"),
  query("success").optional().isBoolean().withMessage("success must be boolean"),
  query("dateFrom").optional().isISO8601().withMessage("Invalid dateFrom"),
  query("dateTo").optional().isISO8601().withMessage("Invalid dateTo"),
];
