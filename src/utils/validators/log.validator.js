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

export const tailLogValidator = [
  query("file").optional().isIn(["app.log", "error.log"]).withMessage("Invalid file"),
  query("lines")
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage("lines must be between 1 and 1000"),
];
