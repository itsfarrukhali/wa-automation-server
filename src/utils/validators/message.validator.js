import { body, param, query, validationResult } from "express-validator";
import ApiResponseUtil from "../helpers/apiResponse.utils.js";

const MESSAGE_TYPES = [
  "booking_confirmation",
  "booking_reminder",
  "booking_cancellation",
  "booking_rescheduled",
  "booking_followup",
  "campaign_winback",
  "campaign_promo",
  "campaign_review",
  "campaign_birthday",
  "campaign_announcement",
  "manual",
  "quick_reply",
  "ai_reply",
];

const DIRECTIONS = ["in", "out"];
const STATUSES = [
  "pending",
  "sent",
  "delivered",
  "read",
  "failed",
  "bounced",
  "deleted",
  "expired",
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

export const sendTextValidator = [
  body("customerId").isMongoId().withMessage("customerId must be valid"),
  body("text")
    .trim()
    .notEmpty()
    .withMessage("text is required")
    .isLength({ max: 4096 })
    .withMessage("text cannot exceed 4096 characters"),
  body("previewUrl")
    .optional()
    .isBoolean()
    .withMessage("previewUrl must be a boolean"),
  body("type").optional().isIn(MESSAGE_TYPES).withMessage("Invalid type"),
];

export const sendTemplateValidator = [
  body("customerId").isMongoId().withMessage("customerId must be valid"),
  body("templateName")
    .trim()
    .notEmpty()
    .withMessage("templateName is required"),
  body("language").optional().trim().notEmpty(),
  body("components")
    .optional()
    .isArray()
    .withMessage("components must be an array"),
  body("type").optional().isIn(MESSAGE_TYPES).withMessage("Invalid type"),
];

export const listMessagesValidator = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("page must be at least 1"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100"),
  query("customerId").optional().isMongoId().withMessage("Invalid customerId"),
  query("direction")
    .optional()
    .isIn(DIRECTIONS)
    .withMessage("direction must be in or out"),
  query("status").optional().isIn(STATUSES).withMessage("Invalid status"),
  query("search")
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("search must be between 1 and 100 characters"),
];

export const inboxValidator = [
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100"),
  query("status")
    .optional()
    .isIn(["all", "unread", "needs_human"])
    .withMessage("Invalid inbox status"),
  query("search")
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("search must be between 1 and 100 characters"),
];

export const conversationValidator = [
  param("customerId").isMongoId().withMessage("customerId must be valid"),
  query("before").optional().isISO8601().withMessage("Invalid before date"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100"),
];

export const messageIdValidator = [
  param("messageId").isMongoId().withMessage("messageId must be valid"),
];

export const analyticsValidator = [
  query("dateFrom").optional().isISO8601().withMessage("Invalid dateFrom"),
  query("dateTo").optional().isISO8601().withMessage("Invalid dateTo"),
];
