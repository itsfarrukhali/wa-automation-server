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

export const dateRangeValidator = [
  query("dateFrom").optional().isISO8601().withMessage("Invalid dateFrom"),
  query("dateTo").optional().isISO8601().withMessage("Invalid dateTo"),
  query("days")
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage("days must be between 1 and 365"),
];
