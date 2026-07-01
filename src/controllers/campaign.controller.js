import ApiResponseUtil from "../utils/helpers/apiResponse.utils.js";
import { asyncHandler } from "../utils/helpers/errorHandler.utils.js";
import * as CampaignService from "../services/campaign.service.js";

export const listCampaigns = asyncHandler(async (req, res) => {
  const result = await CampaignService.listCampaigns(req.user.userId, req.query);
  return ApiResponseUtil.success(res, result);
});

export const createCampaign = asyncHandler(async (req, res) => {
  const result = await CampaignService.createCampaign(req.user.userId, req.body);
  return ApiResponseUtil.created(res, result, "Campaign created");
});

export const previewCampaignRecipients = asyncHandler(async (req, res) => {
  const result = await CampaignService.previewCampaignRecipients(
    req.user.userId,
    req.body,
  );
  return ApiResponseUtil.success(res, result);
});

export const getCampaign = asyncHandler(async (req, res) => {
  const result = await CampaignService.getCampaign(
    req.user.userId,
    req.params.campaignId,
  );
  return ApiResponseUtil.success(res, result);
});

export const updateCampaign = asyncHandler(async (req, res) => {
  const result = await CampaignService.updateCampaign(
    req.user.userId,
    req.params.campaignId,
    req.body,
  );
  return ApiResponseUtil.success(res, result, "Campaign updated");
});

export const launchCampaign = asyncHandler(async (req, res) => {
  const result = await CampaignService.launchCampaign(
    req.user.userId,
    req.params.campaignId,
    req.body,
  );
  return ApiResponseUtil.success(
    res,
    result,
    result.dryRun ? "Campaign dry run completed" : "Campaign launched",
  );
});

export const pauseCampaign = asyncHandler(async (req, res) => {
  const result = await CampaignService.pauseCampaign(
    req.user.userId,
    req.params.campaignId,
  );
  return ApiResponseUtil.success(res, result, "Campaign paused");
});

export const resumeCampaign = asyncHandler(async (req, res) => {
  const result = await CampaignService.resumeCampaign(
    req.user.userId,
    req.params.campaignId,
  );
  return ApiResponseUtil.success(res, result, "Campaign resumed");
});

export const cancelCampaign = asyncHandler(async (req, res) => {
  const result = await CampaignService.cancelCampaign(
    req.user.userId,
    req.params.campaignId,
    req.body.reason,
  );
  return ApiResponseUtil.success(res, result, "Campaign cancelled");
});

export const cloneCampaign = asyncHandler(async (req, res) => {
  const result = await CampaignService.cloneCampaign(
    req.user.userId,
    req.params.campaignId,
    req.body.name,
  );
  return ApiResponseUtil.created(res, result, "Campaign cloned");
});

export const getCampaignAnalytics = asyncHandler(async (req, res) => {
  const result = await CampaignService.getCampaignAnalytics(
    req.user.userId,
    req.query,
  );
  return ApiResponseUtil.success(res, result);
});
