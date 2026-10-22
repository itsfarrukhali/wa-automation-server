import ApiResponseUtil from "../utils/helpers/apiResponse.utils.js";
import { asyncHandler } from "../utils/helpers/errorHandler.utils.js";
import logger from "../lib/logger.js";
import * as WebhookService from "../services/webhook.service.js";

export const verifyWhatsAppWebhook = asyncHandler(async (req, res) => {
  const challenge = WebhookService.verifyWhatsAppWebhook(req.query);
  return res.status(200).send(challenge);
});

export const receiveWhatsAppWebhook = asyncHandler(async (req, res) => {
  WebhookService.verifyWhatsAppWebhookSignature({
    signature: req.get("x-hub-signature-256"),
    rawBody: req.rawBody,
  });
  const result = await WebhookService.processWhatsAppWebhook(req.body);
  logger.info("whatsapp_webhook_processed", {
    requestId: req.requestId,
    processed: result.processed,
    ignored: result.ignored,
    actions: result.results.map((item) => item.action),
  });
  return ApiResponseUtil.success(res, result, "Webhook processed");
});
