import { body, param, query, validationResult } from "express-validator";
import ApiResponseUtil from "../helpers/apiResponse.utils.js";

const STATUSES = [
  "pending",
  "confirmed",
  "arrived",
  "in_progress",
  "completed",
  "no_show",
  "cancelled",
  "rescheduled",
];
const PAYMENT_METHODS = [
  "cash",
  "card",
  "jazzcash",
  "easypaisa",
  "bank_transfer",
];

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

const scheduledAtRule = (field) =>
  body(field)
    .isISO8601()
    .withMessage(`${field} must be a valid ISO date`)
    .custom((value) => new Date(value) > new Date())
    .withMessage(`${field} must be in the future`);

export const createBookingValidator = [
  body("customerId").isMongoId().withMessage("customerId must be valid"),
  body("serviceId").isMongoId().withMessage("serviceId must be valid"),
  body("staffId")
    .optional({ nullable: true, checkFalsy: true })
    .isMongoId()
    .withMessage("staffId must be valid"),
  scheduledAtRule("scheduledAt"),
  body("status")
    .optional()
    .isIn(["pending", "confirmed"])
    .withMessage("Initial status must be pending or confirmed"),
  body("totalAmount")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("totalAmount cannot be negative"),
  body("amountPaid")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("amountPaid cannot be negative"),
  body("preferredPaymentMethod")
    .optional()
    .isIn(PAYMENT_METHODS)
    .withMessage("Invalid payment method"),
  body("source")
    .optional()
    .isIn(["whatsapp", "phone", "walk_in", "website", "app", "staff", "other"])
    .withMessage("Invalid booking source"),
  body("notes")
    .optional()
    .isLength({ max: 500 })
    .withMessage("notes cannot exceed 500 characters"),
];

export const bookingIdValidator = [
  param("bookingId")
    .isMongoId()
    .withMessage("bookingId must be a valid MongoDB ObjectId"),
];

export const listBookingsValidator = [
  query("page").optional().isInt({ min: 1 }).withMessage("page must be at least 1"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100"),
  query("status").optional().isIn(STATUSES).withMessage("Invalid status"),
  query("customerId").optional().isMongoId().withMessage("Invalid customerId"),
  query("serviceId").optional().isMongoId().withMessage("Invalid serviceId"),
  query("staffId").optional().isMongoId().withMessage("Invalid staffId"),
  query("paymentStatus")
    .optional()
    .isIn(["unpaid", "partial", "paid", "refunded", "waived"])
    .withMessage("Invalid paymentStatus"),
  query("dateFrom").optional().isISO8601().withMessage("Invalid dateFrom"),
  query("dateTo").optional().isISO8601().withMessage("Invalid dateTo"),
  query("sortOrder")
    .optional()
    .isIn(["asc", "desc"])
    .withMessage("sortOrder must be asc or desc"),
];

export const dailyScheduleValidator = [
  query("date")
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage("date must use YYYY-MM-DD"),
];

export const updateBookingValidator = [
  body("scheduledAt")
    .optional()
    .isISO8601()
    .withMessage("scheduledAt must be a valid ISO date")
    .custom((value) => new Date(value) > new Date())
    .withMessage("scheduledAt must be in the future"),
  body("staffId")
    .optional({ nullable: true, checkFalsy: true })
    .isMongoId()
    .withMessage("staffId must be valid"),
  body("notes")
    .optional()
    .isLength({ max: 500 })
    .withMessage("notes cannot exceed 500 characters"),
  body("internalNotes")
    .optional()
    .isLength({ max: 1000 })
    .withMessage("internalNotes cannot exceed 1000 characters"),
  body("preferredPaymentMethod")
    .optional()
    .isIn(PAYMENT_METHODS)
    .withMessage("Invalid payment method"),
];

export const statusValidator = [
  body("status")
    .isIn(["confirmed", "arrived", "in_progress", "completed", "no_show", "cancelled"])
    .withMessage("Invalid status transition target"),
  body("reason")
    .if(body("status").equals("cancelled"))
    .notEmpty()
    .withMessage("reason is required when cancelling")
    .isIn([
      "customer_request",
      "staff_unavailable",
      "weather",
      "emergency",
      "double_booked",
      "payment_issue",
      "other",
    ])
    .withMessage("Invalid cancellation reason"),
  body("feedback.rating")
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage("feedback.rating must be between 1 and 5"),
];

export const rescheduleValidator = [scheduledAtRule("scheduledAt")];

export const paymentValidator = [
  body("amount")
    .isFloat({ gt: 0 })
    .withMessage("amount must be greater than zero"),
  body("method").isIn(PAYMENT_METHODS).withMessage("Invalid payment method"),
  body("reference")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("reference cannot exceed 100 characters"),
];
