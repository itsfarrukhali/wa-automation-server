import { Router } from "express";
import {
  cancelCampaign,
  cloneCampaign,
  createCampaign,
  getCampaign,
  getCampaignAnalytics,
  launchCampaign,
  listCampaigns,
  pauseCampaign,
  previewCampaignRecipients,
  resumeCampaign,
  updateCampaign,
} from "../../../controllers/campaign.controller.js";
import {
  analyticsValidator,
  campaignIdValidator,
  cancelCampaignValidator,
  cloneCampaignValidator,
  createCampaignValidator,
  launchCampaignValidator,
  listCampaignsValidator,
  previewCampaignValidator,
  updateCampaignValidator,
  validate,
} from "../../../utils/validators/campaign.validator.js";
import {
  requireStaff,
  requireVerifiedEmail,
  verifyToken,
} from "../../../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyToken, requireVerifiedEmail, requireStaff);

router.get("/", listCampaignsValidator, validate, listCampaigns);
router.post("/", createCampaignValidator, validate, createCampaign);
router.get("/analytics", analyticsValidator, validate, getCampaignAnalytics);
router.post("/preview", previewCampaignValidator, validate, previewCampaignRecipients);
router.get("/:campaignId", campaignIdValidator, validate, getCampaign);
router.patch("/:campaignId", updateCampaignValidator, validate, updateCampaign);
router.post("/:campaignId/launch", launchCampaignValidator, validate, launchCampaign);
router.post("/:campaignId/pause", campaignIdValidator, validate, pauseCampaign);
router.post("/:campaignId/resume", campaignIdValidator, validate, resumeCampaign);
router.post("/:campaignId/cancel", cancelCampaignValidator, validate, cancelCampaign);
router.post("/:campaignId/clone", cloneCampaignValidator, validate, cloneCampaign);

export default router;
