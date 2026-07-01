import ApiResponseUtil from "../utils/helpers/apiResponse.utils.js";
import { asyncHandler } from "../utils/helpers/errorHandler.utils.js";
import * as TemplateService from "../services/template.service.js";

export const listTemplates = asyncHandler(async (req, res) => {
  const result = await TemplateService.listTemplates(req.user.userId, req.query);
  return ApiResponseUtil.success(res, result);
});

export const createTemplate = asyncHandler(async (req, res) => {
  const result = await TemplateService.createTemplate(req.user.userId, req.body);
  return ApiResponseUtil.created(res, result, "Template saved");
});

export const updateTemplate = asyncHandler(async (req, res) => {
  const result = await TemplateService.updateTemplate(
    req.user.userId,
    req.params.templateId,
    req.body,
  );
  return ApiResponseUtil.success(res, result, "Template updated");
});

export const deleteTemplate = asyncHandler(async (req, res) => {
  const result = await TemplateService.deleteTemplate(
    req.user.userId,
    req.params.templateId,
  );
  return ApiResponseUtil.success(res, result, "Template deleted");
});

export const markTemplateUsed = asyncHandler(async (req, res) => {
  const result = await TemplateService.markTemplateUsed(
    req.user.userId,
    req.params.templateId,
  );
  return ApiResponseUtil.success(res, result, "Template usage updated");
});

export const syncTemplatesFromMeta = asyncHandler(async (req, res) => {
  const result = await TemplateService.syncTemplatesFromMeta(req.user.userId);
  return ApiResponseUtil.success(res, result, "Templates synced from Meta");
});

export const getTemplateStats = asyncHandler(async (req, res) => {
  const result = await TemplateService.getTemplateStats(req.user.userId);
  return ApiResponseUtil.success(res, result);
});
