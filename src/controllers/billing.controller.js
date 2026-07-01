import ApiResponseUtil from "../utils/helpers/apiResponse.utils.js";
import { asyncHandler } from "../utils/helpers/errorHandler.utils.js";
import * as BillingService from "../services/billing.service.js";

export const listPlans = asyncHandler(async (_req, res) => {
  const result = await BillingService.listPlans();
  return ApiResponseUtil.success(res, result);
});

export const getSubscription = asyncHandler(async (req, res) => {
  const result = await BillingService.getSubscription(req.user.userId);
  return ApiResponseUtil.success(res, result);
});

export const createCheckoutIntent = asyncHandler(async (req, res) => {
  const result = await BillingService.createCheckoutIntent(
    req.user.userId,
    req.body,
  );
  return ApiResponseUtil.created(res, result, "Checkout intent created");
});

export const confirmManualPayment = asyncHandler(async (req, res) => {
  const result = await BillingService.confirmManualPayment(
    req.user.userId,
    req.body,
  );
  return ApiResponseUtil.success(res, result, "Payment confirmed");
});

export const cancelSubscription = asyncHandler(async (req, res) => {
  const result = await BillingService.cancelSubscription(req.user.userId);
  return ApiResponseUtil.success(res, result, "Subscription cancelled");
});

export const downgradeToFree = asyncHandler(async (req, res) => {
  const result = await BillingService.downgradeToFree(req.user.userId);
  return ApiResponseUtil.success(res, result, "Subscription downgraded");
});
