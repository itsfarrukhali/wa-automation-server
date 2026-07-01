import { body, param, query, validationResult } from "express-validator";
import ApiResponseUtil from "../helpers/apiResponse.utils.js";

const PHONE_REGEX = /^(\+92|0)?3[0-9]{2}[0-9]{7}$/;
const SOURCES = [
  "manual",
  "walk_in",
  "whatsapp",
  "phone_call",
  "website",
  "facebook",
  "instagram",
  "google",
  "referral",
  "import",
  "other",
];
const STATUSES = ["active", "inactive", "blocked"];
const TAGS = ["vip", "new", "inactive", "regular", "whale", "at_risk", "lost"];

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

const optionalRules = [
  body("email")
    .optional({ nullable: true, checkFalsy: true })
    .isEmail()
    .withMessage("Invalid email address")
    .normalizeEmail(),
  body("whatsappNumber")
    .optional()
    .trim()
    .custom((value) => PHONE_REGEX.test(value.replace(/[-\s]/g, "")))
    .withMessage("Invalid Pakistani WhatsApp number"),
  body("notes")
    .optional()
    .isLength({ max: 1000 })
    .withMessage("Notes cannot exceed 1000 characters"),
  body("privateNotes")
    .optional()
    .isLength({ max: 2000 })
    .withMessage("Private notes cannot exceed 2000 characters"),
  body("source").optional().isIn(SOURCES).withMessage("Invalid customer source"),
  body("status")
    .optional()
    .isIn(STATUSES)
    .withMessage("Invalid customer status"),
  body("tags")
    .optional()
    .isArray({ max: 7 })
    .withMessage("tags must be an array"),
  body("tags.*").optional().isIn(TAGS).withMessage("Invalid customer tag"),
  body("whatsappOptIn")
    .optional()
    .isBoolean()
    .withMessage("whatsappOptIn must be a boolean"),
  body("consentGiven")
    .optional()
    .isBoolean()
    .withMessage("consentGiven must be a boolean"),
  body("birthdate")
    .optional({ nullable: true })
    .isISO8601()
    .withMessage("birthdate must be a valid date")
    .custom((value) => new Date(value) < new Date())
    .withMessage("birthdate must be in the past"),
];

export const createCustomerValidator = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Customer name is required")
    .isLength({ max: 100 })
    .withMessage("Customer name cannot exceed 100 characters"),
  body("phone")
    .trim()
    .notEmpty()
    .withMessage("Phone number is required")
    .custom((value) => PHONE_REGEX.test(value.replace(/[-\s]/g, "")))
    .withMessage("Invalid Pakistani phone number"),
  ...optionalRules,
];

export const updateCustomerValidator = [
  body("name")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Customer name cannot be empty")
    .isLength({ max: 100 })
    .withMessage("Customer name cannot exceed 100 characters"),
  body("phone")
    .optional()
    .trim()
    .custom((value) => PHONE_REGEX.test(value.replace(/[-\s]/g, "")))
    .withMessage("Invalid Pakistani phone number"),
  ...optionalRules,
];

export const customerIdValidator = [
  param("customerId")
    .isMongoId()
    .withMessage("customerId must be a valid MongoDB ObjectId"),
];

export const listCustomersValidator = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("page must be at least 1"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100"),
  query("status").optional().isIn(STATUSES).withMessage("Invalid status"),
  query("tag").optional().isIn(TAGS).withMessage("Invalid tag"),
  query("source").optional().isIn(SOURCES).withMessage("Invalid source"),
  query("whatsappOptIn")
    .optional()
    .isIn(["true", "false"])
    .withMessage("whatsappOptIn must be true or false"),
  query("sortBy")
    .optional()
    .isIn(["createdAt", "name", "lastVisit", "totalSpent", "totalVisits"])
    .withMessage("Invalid sortBy value"),
  query("sortOrder")
    .optional()
    .isIn(["asc", "desc"])
    .withMessage("sortOrder must be asc or desc"),
];

export const importCustomersValidator = [
  body("customers")
    .isArray({ min: 1, max: 500 })
    .withMessage("customers must contain between 1 and 500 records"),
  body("customers.*.name")
    .trim()
    .notEmpty()
    .withMessage("Each customer requires a name"),
  body("customers.*.phone")
    .trim()
    .custom((value) => PHONE_REGEX.test(value.replace(/[-\s]/g, "")))
    .withMessage("Each customer requires a valid Pakistani phone number"),
  body("customers.*.email")
    .optional({ nullable: true, checkFalsy: true })
    .isEmail()
    .withMessage("Invalid customer email"),
];

export const bookingHistoryValidator = [
  ...customerIdValidator,
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("page must be at least 1"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100"),
  query("status")
    .optional()
    .isIn([
      "pending",
      "confirmed",
      "arrived",
      "in_progress",
      "completed",
      "no_show",
      "cancelled",
      "rescheduled",
    ])
    .withMessage("Invalid booking status"),
];
