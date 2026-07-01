import { body, param, query, validationResult } from "express-validator";
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

const optionalRules = [
  body("description")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Description cannot exceed 500 characters"),
  body("category")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Category cannot exceed 100 characters"),
  body("bufferBefore")
    .optional()
    .isInt({ min: 0, max: 60 })
    .withMessage("bufferBefore must be between 0 and 60 minutes"),
  body("bufferAfter")
    .optional()
    .isInt({ min: 0, max: 60 })
    .withMessage("bufferAfter must be between 0 and 60 minutes"),
  body("assignedStaff")
    .optional()
    .isArray({ max: 100 })
    .withMessage("assignedStaff must be an array"),
  body("assignedStaff.*")
    .optional()
    .isMongoId()
    .withMessage("assignedStaff contains an invalid user ID"),
  body("color")
    .optional()
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage("color must be a valid hex value"),
  body("image")
    .optional({ checkFalsy: true })
    .isURL()
    .withMessage("image must be a valid URL"),
  body("isActive")
    .optional()
    .isBoolean()
    .withMessage("isActive must be a boolean"),
  body("isPopular")
    .optional()
    .isBoolean()
    .withMessage("isPopular must be a boolean"),
  body("sortOrder")
    .optional()
    .isInt({ min: 0 })
    .withMessage("sortOrder must be zero or greater"),
  body("discount.value")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("discount.value cannot be negative"),
  body("discount.validUntil")
    .optional()
    .isISO8601()
    .withMessage("discount.validUntil must be a valid date"),
  body("addOns")
    .optional()
    .isArray({ max: 50 })
    .withMessage("addOns must be an array"),
];

export const createServiceValidator = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Service name is required")
    .isLength({ max: 150 })
    .withMessage("Service name cannot exceed 150 characters"),
  body("price")
    .isFloat({ min: 0 })
    .withMessage("price must be zero or greater"),
  body("duration")
    .isInt({ min: 5, max: 480 })
    .withMessage("duration must be between 5 and 480 minutes"),
  ...optionalRules,
];

export const updateServiceValidator = [
  body("name")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Service name cannot be empty")
    .isLength({ max: 150 })
    .withMessage("Service name cannot exceed 150 characters"),
  body("price")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("price must be zero or greater"),
  body("duration")
    .optional()
    .isInt({ min: 5, max: 480 })
    .withMessage("duration must be between 5 and 480 minutes"),
  ...optionalRules,
];

export const serviceIdValidator = [
  param("serviceId")
    .isMongoId()
    .withMessage("serviceId must be a valid MongoDB ObjectId"),
];

export const listServicesValidator = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("page must be at least 1"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100"),
  query("isActive")
    .optional()
    .isIn(["true", "false"])
    .withMessage("isActive must be true or false"),
  query("isPopular")
    .optional()
    .isIn(["true", "false"])
    .withMessage("isPopular must be true or false"),
  query("discounted")
    .optional()
    .isIn(["true", "false"])
    .withMessage("discounted must be true or false"),
  query("sortBy")
    .optional()
    .isIn(["sortOrder", "name", "price", "duration", "createdAt"])
    .withMessage("Invalid sortBy value"),
  query("sortOrder")
    .optional()
    .isIn(["asc", "desc"])
    .withMessage("sortOrder must be asc or desc"),
];

export const importServicesValidator = [
  body("services")
    .isArray({ min: 1, max: 200 })
    .withMessage("services must contain between 1 and 200 records"),
  body("services.*.name")
    .trim()
    .notEmpty()
    .withMessage("Each service requires a name"),
  body("services.*.price")
    .isFloat({ min: 0 })
    .withMessage("Each service requires a valid price"),
  body("services.*.duration")
    .isInt({ min: 5, max: 480 })
    .withMessage("Each service duration must be between 5 and 480 minutes"),
];
