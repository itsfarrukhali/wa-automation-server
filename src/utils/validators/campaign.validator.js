import { body, param, query, validationResult } from "express-validator";
import ApiResponseUtil from "../helpers/apiResponse.utils.js";

const CAMPAIGN_TYPES = [
  "winback",
  "birthday",
  "reminder",
  "promo",
  "review",
  "announcement",
  "seasonal",
  "follow_up",
];

const CAMPAIGN_STATUSES = [
  "draft",
  "scheduled",
  "queued",
  "processing",
  "sending",
  "paused",
  "completed",
  "failed",
  "cancelled",
];

const TARGET_TAGS = [
  "vip",
  "new",
  "inactive",
  "regular",
  "at_risk",
  "lost",
  "all",
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

const targetValidator = [
  body("target.tags")
    .optional()
    .isArray()
    .withMessage("target.tags must be an array"),
  body("target.tags.*").optional().isIn(TARGET_TAGS).withMessage("Invalid tag"),
  body("target.specificCustomers")
    .optional()
    .isArray()
    .withMessage("target.specificCustomers must be an array"),
  body("target.specificCustomers.*")
    .optional()
    .isMongoId()
    .withMessage("Invalid customer ID"),
  body("target.excludeCustomers")
    .optional()
    .isArray()
    .withMessage("target.excludeCustomers must be an array"),
  body("target.excludeCustomers.*")
    .optional()
    .isMongoId()
    .withMessage("Invalid excluded customer ID"),
  body("target.filters.minVisits")
    .optional()
    .isInt({ min: 0 })
    .withMessage("minVisits must be 0 or greater"),
  body("target.filters.maxVisits")
    .optional()
    .isInt({ min: 0 })
    .withMessage("maxVisits must be 0 or greater"),
  body("target.filters.minSpent")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("minSpent must be 0 or greater"),
  body("target.filters.maxSpent")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("maxSpent must be 0 or greater"),
  body("target.filters.lastVisitBefore")
    .optional()
    .isISO8601()
    .withMessage("lastVisitBefore must be a valid date"),
  body("target.filters.lastVisitAfter")
    .optional()
    .isISO8601()
    .withMessage("lastVisitAfter must be a valid date"),
  body("target.filters.gender")
    .optional()
    .isIn(["male", "female", "other", "all"])
    .withMessage("Invalid gender"),
  body("target.filters.city")
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("city must be between 1 and 100 characters"),
];

export const listCampaignsValidator = [
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
    .isIn(CAMPAIGN_STATUSES)
    .withMessage("Invalid campaign status"),
  query("type")
    .optional()
    .isIn(CAMPAIGN_TYPES)
    .withMessage("Invalid campaign type"),
  query("search")
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("search must be between 1 and 100 characters"),
];

export const campaignIdValidator = [
  param("campaignId").isMongoId().withMessage("campaignId must be valid"),
];

export const createCampaignValidator = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("name is required")
    .isLength({ max: 150 })
    .withMessage("name cannot exceed 150 characters"),
  body("description")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("description cannot exceed 500 characters"),
  body("type").isIn(CAMPAIGN_TYPES).withMessage("Invalid campaign type"),
  body("message")
    .trim()
    .notEmpty()
    .withMessage("message is required")
    .isLength({ max: 1024 })
    .withMessage("message cannot exceed 1024 characters"),
  body("whatsappTemplate.templateName")
    .trim()
    .notEmpty()
    .withMessage("whatsappTemplate.templateName is required"),
  body("whatsappTemplate.language")
    .optional()
    .isIn(["en", "ur"])
    .withMessage("whatsappTemplate.language must be en or ur"),
  body("whatsappTemplate.category")
    .optional()
    .isIn(["UTILITY", "MARKETING", "AUTHENTICATION"])
    .withMessage("Invalid WhatsApp template category"),
  body("scheduledAt")
    .optional()
    .isISO8601()
    .withMessage("scheduledAt must be a valid date"),
  body("tags").optional().isArray().withMessage("tags must be an array"),
  ...targetValidator,
];

export const updateCampaignValidator = [
  ...campaignIdValidator,
  body("name")
    .optional()
    .trim()
    .isLength({ min: 1, max: 150 })
    .withMessage("name must be between 1 and 150 characters"),
  body("description")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("description cannot exceed 500 characters"),
  body("type").optional().isIn(CAMPAIGN_TYPES).withMessage("Invalid type"),
  body("message")
    .optional()
    .trim()
    .isLength({ min: 1, max: 1024 })
    .withMessage("message must be between 1 and 1024 characters"),
  body("scheduledAt")
    .optional({ nullable: true })
    .isISO8601()
    .withMessage("scheduledAt must be a valid date"),
  ...targetValidator,
];

export const previewCampaignValidator = [
  body("campaignId")
    .optional()
    .isMongoId()
    .withMessage("campaignId must be valid"),
  body("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100"),
  ...targetValidator,
];

export const launchCampaignValidator = [
  ...campaignIdValidator,
  body("dryRun").optional().isBoolean().withMessage("dryRun must be boolean"),
  body("allowPartial")
    .optional()
    .isBoolean()
    .withMessage("allowPartial must be boolean"),
  body("sendMode")
    .optional()
    .isIn(["text", "template"])
    .withMessage("sendMode must be text or template"),
  body("limit")
    .optional()
    .isInt({ min: 1, max: 5000 })
    .withMessage("limit must be between 1 and 5000"),
];

export const cancelCampaignValidator = [
  ...campaignIdValidator,
  body("reason")
    .optional()
    .trim()
    .isLength({ min: 1, max: 300 })
    .withMessage("reason must be between 1 and 300 characters"),
];

export const cloneCampaignValidator = [
  ...campaignIdValidator,
  body("name")
    .optional()
    .trim()
    .isLength({ min: 1, max: 150 })
    .withMessage("name must be between 1 and 150 characters"),
];

export const analyticsValidator = [
  query("days")
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage("days must be between 1 and 365"),
];
