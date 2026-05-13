/**
 * controllers/business.controller.js
 *
 * Thin HTTP layer — reads req, calls business.service.js, writes res.
 * No business logic here. Pattern is identical to auth.controller.js.
 *
 * Every handler:
 *   1. Pulls what it needs from req (body, params, user)
 *   2. Calls the service
 *   3. Sends the response
 */

import { asyncHandler } from "../utils/helpers/errorHandler.utils.js";
import ApiResponseUtil from "../utils/helpers/apiResponse.utils.js";
import * as BusinessService from "../services/business.service.js";

// ─── Read ─────────────────────────────────────────────────────────────────────

export const getMyBusiness = asyncHandler(async (req, res) => {
  const business = await BusinessService.getMyBusiness(req.user.userId);
  return ApiResponseUtil.success(res, { business });
});

export const getOnboardingStatus = asyncHandler(async (req, res) => {
  const status = await BusinessService.getOnboardingStatus(req.user.userId);
  return ApiResponseUtil.success(res, status);
});

export const getDashboard = asyncHandler(async (req, res) => {
  const stats = await BusinessService.getDashboardStats(req.user.userId);
  return ApiResponseUtil.success(res, stats);
});

// ─── Onboarding Steps ─────────────────────────────────────────────────────────

export const onboardStep1 = asyncHandler(async (req, res) => {
  const { name, type, phone, landline, email } = req.body;
  const business = await BusinessService.completeStep1BasicInfo(
    req.user.userId,
    { name, type, phone, landline, email },
  );
  return ApiResponseUtil.success(
    res,
    { business, nextStep: 2 },
    "Basic info saved. Let's set your location.",
  );
});

export const onboardStep2 = asyncHandler(async (req, res) => {
  const { city, area, address, location } = req.body;
  const business = await BusinessService.completeStep2Location(
    req.user.userId,
    {
      city,
      area,
      address,
      location,
    },
  );
  return ApiResponseUtil.success(
    res,
    { business, nextStep: 3 },
    "Location saved. Now set your working hours.",
  );
});

export const onboardStep3 = asyncHandler(async (req, res) => {
  const { workingHours, timezone } = req.body;
  const business = await BusinessService.completeStep3WorkingHours(
    req.user.userId,
    { workingHours, timezone },
  );
  return ApiResponseUtil.success(
    res,
    { business, nextStep: 4 },
    "Working hours saved. Configure your engagement settings.",
  );
});

export const onboardStep4 = asyncHandler(async (req, res) => {
  const {
    reminderTime,
    followUpDays,
    winbackDays,
    reviewRequestEnabled,
    reviewPlatform,
  } = req.body;
  const business = await BusinessService.completeStep4Engagement(
    req.user.userId,
    {
      reminderTime,
      followUpDays,
      winbackDays,
      reviewRequestEnabled,
      reviewPlatform,
    },
  );
  return ApiResponseUtil.success(
    res,
    { business, nextStep: 5 },
    "Engagement settings saved. Last step — connect WhatsApp.",
  );
});

export const onboardStep5 = asyncHandler(async (req, res) => {
  const {
    phoneNumberId,
    wabaId,
    displayPhoneNumber,
    verifiedName,
    accessToken,
  } = req.body;
  const business = await BusinessService.completeStep5WhatsApp(
    req.user.userId,
    { phoneNumberId, wabaId, displayPhoneNumber, verifiedName, accessToken },
  );
  return ApiResponseUtil.success(
    res,
    { business },
    "🎉 WhatsApp connected! Your business is ready to automate customer communication.",
  );
});

// ─── Profile Updates ───────────────────────────────────────────────────────────

export const updateProfile = asyncHandler(async (req, res) => {
  const business = await BusinessService.updateProfile(
    req.user.userId,
    req.body,
  );
  return ApiResponseUtil.success(
    res,
    { business },
    "Business profile updated successfully",
  );
});

export const updateSettings = asyncHandler(async (req, res) => {
  const business = await BusinessService.updateSettings(
    req.user.userId,
    req.body,
  );
  return ApiResponseUtil.success(
    res,
    { business },
    "Settings updated successfully",
  );
});

export const updateWorkingHoursDay = asyncHandler(async (req, res) => {
  const { day } = req.params;
  const { isOpen, openTime, closeTime } = req.body;
  const business = await BusinessService.updateWorkingHoursDay(
    req.user.userId,
    day,
    { isOpen, openTime, closeTime },
  );
  return ApiResponseUtil.success(
    res,
    { business },
    `Working hours updated for ${day}`,
  );
});

export const updateEngagement = asyncHandler(async (req, res) => {
  const business = await BusinessService.updateEngagement(
    req.user.userId,
    req.body,
  );
  return ApiResponseUtil.success(
    res,
    { business },
    "Engagement settings updated successfully",
  );
});

// ─── Plan ─────────────────────────────────────────────────────────────────────

export const getPlan = asyncHandler(async (req, res) => {
  const plan = await BusinessService.getPlanDetails(req.user.userId);
  return ApiResponseUtil.success(res, { plan });
});

export const upgradePlan = asyncHandler(async (req, res) => {
  const { businessId, newPlan, paymentMethod } = req.body;
  const business = await BusinessService.upgradePlan(
    businessId,
    newPlan,
    paymentMethod,
  );
  return ApiResponseUtil.success(
    res,
    {
      business: {
        id: business._id,
        name: business.name,
        plan: business.plan,
      },
    },
    `Business upgraded to ${newPlan} plan successfully`,
  );
});

// ─── Admin ────────────────────────────────────────────────────────────────────

export const listBusinesses = asyncHandler(async (req, res) => {
  const { page, limit, isActive, onboardingComplete, type, city } = req.query;
  const result = await BusinessService.listBusinesses({
    page,
    limit,
    isActive,
    onboardingComplete,
    type,
    city,
  });
  return ApiResponseUtil.success(res, result);
});
