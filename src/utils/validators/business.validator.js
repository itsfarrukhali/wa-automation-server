/**
 * utils/validators/business.validator.js
 *
 * express-validator chains for the business module.
 * Pattern matches auth.validator.js — arrays of check() rules + the shared validate() middleware.
 */

import { body, param, query } from "express-validator";
import { validationResult } from "express-validator";
import ApiResponseUtil from "../helpers/apiResponse.utils.js";

// ─── Shared validate middleware ────────────────────────────────────────────────

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

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/; // HH:MM 24hr

// ─── Step 1 — Basic Info ──────────────────────────────────────────────────────

export const step1Validator = [
  body("name")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Business name cannot be empty")
    .isLength({ max: 150 })
    .withMessage("Business name cannot exceed 150 characters"),

  body("type")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Business type cannot be empty"),

  body("phone")
    .optional()
    .trim()
    .custom((v) => {
      if (!v) return true;
      const cleaned = v.replace(/-/g, "");
      return /^(\+92|0)?3[0-9]{2}[0-9]{7}$/.test(cleaned);
    })
    .withMessage(
      "Invalid Pakistani phone number. Format: 03XXXXXXXXX or +923XXXXXXXXX",
    ),

  body("landline").optional().trim(),

  body("email")
    .optional()
    .trim()
    .isEmail()
    .withMessage("Invalid email address")
    .normalizeEmail(),
];

// ─── Step 2 — Location ────────────────────────────────────────────────────────

export const step2Validator = [
  body("city").optional().trim().notEmpty().withMessage("City cannot be empty"),

  body("area").optional().trim(),

  body("address")
    .optional()
    .trim()
    .isLength({ max: 300 })
    .withMessage("Address cannot exceed 300 characters"),

  body("location.lat")
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage("Latitude must be between -90 and 90"),

  body("location.lng")
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage("Longitude must be between -180 and 180"),
];

// ─── Step 3 — Working Hours ───────────────────────────────────────────────────

export const step3Validator = [
  body("workingHours")
    .notEmpty()
    .withMessage("workingHours is required")
    .isArray({ min: 1, max: 7 })
    .withMessage("workingHours must be an array of 1–7 day entries"),

  body("workingHours.*.day")
    .notEmpty()
    .withMessage("Each working hours entry must have a day")
    .isIn(VALID_DAYS)
    .withMessage(`day must be one of: ${VALID_DAYS.join(", ")}`),

  body("workingHours.*.isOpen")
    .exists()
    .withMessage("isOpen is required")
    .isBoolean()
    .withMessage("isOpen must be a boolean"),

  body("workingHours.*.openTime")
    .optional()
    .matches(TIME_REGEX)
    .withMessage("openTime must be HH:MM (24-hour format, e.g. 09:00)"),

  body("workingHours.*.closeTime")
    .optional()
    .matches(TIME_REGEX)
    .withMessage("closeTime must be HH:MM (24-hour format, e.g. 18:00)"),

  body("timezone").optional().trim(),
];

// ─── Step 4 — Engagement Settings (Onboarding) ────────────────────────────────

export const step4Validator = [
  body("reminderTime")
    .optional()
    .isInt({ min: 1, max: 72 })
    .withMessage("reminderTime must be between 1 and 72 hours"),

  body("followUpDays")
    .optional()
    .isInt({ min: 1, max: 30 })
    .withMessage("followUpDays must be between 1 and 30"),

  body("winbackDays")
    .optional()
    .isInt({ min: 7, max: 180 })
    .withMessage("winbackDays must be between 7 and 180 days"),

  body("reviewRequestEnabled")
    .optional()
    .isBoolean()
    .withMessage("reviewRequestEnabled must be a boolean"),

  body("reviewPlatform")
    .optional()
    .isIn(["google", "facebook", "custom"])
    .withMessage('reviewPlatform must be "google", "facebook", or "custom"'),
];

// ─── Step 5 — WhatsApp ────────────────────────────────────────────────────────

export const step5Validator = [
  body("phoneNumberId")
    .notEmpty()
    .withMessage("phoneNumberId is required")
    .trim(),

  body("wabaId").optional().trim(),

  body("displayPhoneNumber").optional().trim(),

  body("verifiedName").optional().trim(),

  body("accessToken").optional().trim(),
];

// ─── Profile Update ───────────────────────────────────────────────────────────

export const profileUpdateValidator = [
  body("name")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Business name cannot be empty")
    .isLength({ max: 150 })
    .withMessage("Business name cannot exceed 150 characters"),

  body("phone")
    .optional()
    .trim()
    .custom((v) => {
      if (!v) return true;
      const cleaned = v.replace(/-/g, "");
      return /^(\+92|0)?3[0-9]{2}[0-9]{7}$/.test(cleaned);
    })
    .withMessage("Invalid Pakistani phone number"),

  body("landline").optional().trim(),

  body("email")
    .optional()
    .isEmail()
    .withMessage("Invalid email address")
    .normalizeEmail(),

  body("logo")
    .optional()
    .trim()
    .isURL()
    .withMessage("Logo must be a valid URL"),

  body("coverImage")
    .optional()
    .trim()
    .isURL()
    .withMessage("Cover image must be a valid URL"),
];

// ─── Settings Update ──────────────────────────────────────────────────────────

export const settingsValidator = [
  body("notifications.email")
    .optional()
    .isBoolean()
    .withMessage("notifications.email must be a boolean"),

  body("notifications.whatsapp")
    .optional()
    .isBoolean()
    .withMessage("notifications.whatsapp must be a boolean"),

  body("language")
    .optional()
    .isIn(["en", "ur"])
    .withMessage('language must be "en" or "ur"'),

  body("currency")
    .optional()
    .trim()
    .isLength({ min: 3, max: 3 })
    .withMessage("currency must be a 3-letter code (e.g. PKR)"),
];

// ─── Working Hours Day Update ─────────────────────────────────────────────────

export const workingHoursDayValidator = [
  param("day")
    .isIn(VALID_DAYS)
    .withMessage(`day must be one of: ${VALID_DAYS.join(", ")}`),

  body("isOpen").optional().isBoolean().withMessage("isOpen must be a boolean"),

  body("openTime")
    .optional()
    .matches(TIME_REGEX)
    .withMessage("openTime must be HH:MM (24-hour format)"),

  body("closeTime")
    .optional()
    .matches(TIME_REGEX)
    .withMessage("closeTime must be HH:MM (24-hour format)"),
];

// ─── Engagement Update (Post‑Onboarding) ──────────────────────────────────────

export const engagementValidator = [
  body("reminderTime")
    .optional()
    .isInt({ min: 1, max: 72 })
    .withMessage("reminderTime must be between 1 and 72 hours"),

  body("followUpDays")
    .optional()
    .isInt({ min: 1, max: 30 })
    .withMessage("followUpDays must be between 1 and 30"),

  body("winbackDays")
    .optional()
    .isInt({ min: 7, max: 180 })
    .withMessage("winbackDays must be between 7 and 180 days"),

  body("reviewRequestEnabled")
    .optional()
    .isBoolean()
    .withMessage("reviewRequestEnabled must be a boolean"),

  body("reviewPlatform")
    .optional()
    .isIn(["google", "facebook", "custom"])
    .withMessage('reviewPlatform must be "google", "facebook", or "custom"'),
];

// ─── Plan Upgrade (admin) ─────────────────────────────────────────────────────

export const planUpgradeValidator = [
  body("businessId")
    .notEmpty()
    .withMessage("businessId is required")
    .isMongoId()
    .withMessage("businessId must be a valid MongoDB ObjectId"),

  body("newPlan")
    .notEmpty()
    .withMessage("newPlan is required")
    .isIn(["free", "starter", "growth", "enterprise"])
    .withMessage(
      'newPlan must be one of: "free", "starter", "growth", "enterprise"',
    ),

  body("paymentMethod")
    .optional()
    .isIn(["jazzcash", "easypaisa", "card", "bank_transfer", "manual", "none"])
    .withMessage("Invalid payment method"),
];

// ─── Admin list query ─────────────────────────────────────────────────────────

export const listBusinessesValidator = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("page must be a positive integer"),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100"),

  query("isActive")
    .optional()
    .isIn(["true", "false"])
    .withMessage("isActive must be true or false"),

  query("onboardingComplete")
    .optional()
    .isIn(["true", "false"])
    .withMessage("onboardingComplete must be true or false"),
];
