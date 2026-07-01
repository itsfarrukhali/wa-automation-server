import { body, validationResult } from "express-validator";
import ApiResponseUtil from "../helpers/apiResponse.utils.js";

const PLANS = ["free", "starter", "growth", "enterprise"];
const PAID_PLANS = ["starter", "growth", "enterprise"];
const PAYMENT_METHODS = ["jazzcash", "easypaisa", "card", "bank_transfer", "manual"];

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

export const checkoutValidator = [
  body("plan").isIn(PAID_PLANS).withMessage("A paid plan is required"),
  body("paymentMethod")
    .isIn(PAYMENT_METHODS)
    .withMessage("Invalid payment method"),
];

export const manualPaymentValidator = [
  body("plan").isIn(PAID_PLANS).withMessage("A paid plan is required"),
  body("paymentMethod")
    .optional()
    .isIn(PAYMENT_METHODS)
    .withMessage("Invalid payment method"),
  body("reference")
    .optional()
    .trim()
    .isLength({ min: 1, max: 120 })
    .withMessage("reference must be between 1 and 120 characters"),
  body("amount")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("amount must be 0 or greater"),
];

export const planValidator = [
  body("plan").optional().isIn(PLANS).withMessage("Invalid plan"),
];
