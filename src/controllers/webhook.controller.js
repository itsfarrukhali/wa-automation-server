import ApiResponseUtil from "../utils/helpers/apiResponse.utils.js";
import { asyncHandler } from "../utils/helpers/errorHandler.utils.js";
import * as WebhookService from "../services/webhook.service.js";

export const verifyWhatsAppWebhook = asyncHandler(async (req, res) => {
  const challenge = WebhookService.verifyWhatsAppWebhook(req.query);
  return res.status(200).send(challenge);
});

export const receiveWhatsAppWebhook = asyncHandler(async (req, res) => {
  const result = await WebhookService.processWhatsAppWebhook(req.body);
  return ApiResponseUtil.success(res, result, "Webhook processed");
});
