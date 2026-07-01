import ApiResponseUtil from "../utils/helpers/apiResponse.utils.js";
import { asyncHandler } from "../utils/helpers/errorHandler.utils.js";
import * as AutomationService from "../services/automation.service.js";

export const createAutomationRule = asyncHandler(async (req, res) => {
  const rule = await AutomationService.createAutomationRule(
    req.user.userId,
    req.body,
  );
  return ApiResponseUtil.created(
    res,
    { rule },
    "Automation rule created successfully",
  );
});

export const listAutomationRules = asyncHandler(async (req, res) => {
  const result = await AutomationService.listAutomationRules(
    req.user.userId,
    req.query,
  );
  return ApiResponseUtil.success(res, result);
});

export const getAutomationRule = asyncHandler(async (req, res) => {
  const rule = await AutomationService.getAutomationRule(
    req.user.userId,
    req.params.ruleId,
  );
  return ApiResponseUtil.success(res, { rule });
});

export const updateAutomationRule = asyncHandler(async (req, res) => {
  const rule = await AutomationService.updateAutomationRule(
    req.user.userId,
    req.params.ruleId,
    req.body,
  );
  return ApiResponseUtil.success(
    res,
    { rule },
    "Automation rule updated successfully",
  );
});

export const deleteAutomationRule = asyncHandler(async (req, res) => {
  const result = await AutomationService.deleteAutomationRule(
    req.user.userId,
    req.params.ruleId,
  );
  return ApiResponseUtil.success(
    res,
    result,
    "Automation rule disabled successfully",
  );
});
