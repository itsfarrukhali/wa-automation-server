import ApiResponseUtil from "../utils/helpers/apiResponse.utils.js";
import { asyncHandler } from "../utils/helpers/errorHandler.utils.js";
import * as MessageService from "../services/message.service.js";

export const sendTextMessage = asyncHandler(async (req, res) => {
  const message = await MessageService.sendTextMessage(req.user.userId, req.body);
  return ApiResponseUtil.created(
    res,
    { message },
    "WhatsApp text message sent",
  );
});

export const sendTemplateMessage = asyncHandler(async (req, res) => {
  const message = await MessageService.sendTemplateMessage(
    req.user.userId,
    req.body,
  );
  return ApiResponseUtil.created(
    res,
    { message },
    "WhatsApp template message sent",
  );
});

export const listMessages = asyncHandler(async (req, res) => {
  const result = await MessageService.listMessages(req.user.userId, req.query);
  return ApiResponseUtil.success(res, result);
});

export const getInbox = asyncHandler(async (req, res) => {
  const result = await MessageService.getInbox(req.user.userId, req.query);
  return ApiResponseUtil.success(res, result);
});

export const getConversationThread = asyncHandler(async (req, res) => {
  const result = await MessageService.getConversationThread(
    req.user.userId,
    req.params.customerId,
    req.query,
  );
  return ApiResponseUtil.success(res, result);
});

export const getMessage = asyncHandler(async (req, res) => {
  const message = await MessageService.getMessage(
    req.user.userId,
    req.params.messageId,
  );
  return ApiResponseUtil.success(res, { message });
});

export const markMessageRead = asyncHandler(async (req, res) => {
  const message = await MessageService.markMessageRead(
    req.user.userId,
    req.params.messageId,
  );
  return ApiResponseUtil.success(res, { message }, "Message marked as read");
});

export const getMessageAnalytics = asyncHandler(async (req, res) => {
  const result = await MessageService.getMessageAnalytics(
    req.user.userId,
    req.query,
  );
  return ApiResponseUtil.success(res, result);
});
