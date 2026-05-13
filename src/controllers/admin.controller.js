/**
 * controllers/admin.controller.js
 *
 * Thin HTTP layer — reads req, calls admin.service.js, writes res.
 * No business logic here. Pattern is identical to auth.controller.js.
 *
 * Two tiers:
 *   Admin-level handlers  — available to both "admin" and "superadmin"
 *   Superadmin handlers   — available to "superadmin" only (enforced in routes)
 */

import { asyncHandler } from "../utils/helpers/errorHandler.utils.js";
import ApiResponseUtil from "../utils/helpers/apiResponse.utils.js";
import * as AdminService from "../services/admin.service.js";
import * as emailService from "../services/email.service.js";

// ─── System Stats ─────────────────────────────────────────────────────────────

export const getSystemStats = asyncHandler(async (req, res) => {
  const stats = await AdminService.getSystemStats();
  return ApiResponseUtil.success(res, stats);
});

// ─── User Management ──────────────────────────────────────────────────────────

export const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, role, isActive, isEmailVerified, search } = req.query;

  const result = await AdminService.listUsers({
    page,
    limit,
    role,
    isActive,
    isEmailVerified,
    search,
    actorRole: req.user.role,
  });

  return ApiResponseUtil.success(res, result);
});

export const getUserDetail = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { user, business } = await AdminService.getUserDetail(
    userId,
    req.user.role,
  );
  return ApiResponseUtil.success(res, { user: user.profile, business });
});

export const setUserActiveStatus = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { isActive } = req.body;

  const user = await AdminService.setUserActiveStatus(
    userId,
    isActive,
    req.user.role,
  );

  const action = isActive ? "activated" : "deactivated";
  return ApiResponseUtil.success(
    res,
    { user: user.profile },
    `User account ${action} successfully`,
  );
});

export const changeUserRole = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { role } = req.body;

  if (userId === req.user.userId.toString()) {
    return ApiResponseUtil.forbidden(res, "You cannot change your own role.");
  }

  const { user, previousRole } = await AdminService.changeUserRole(
    userId,
    role,
    req.user.role,
  );

  return ApiResponseUtil.success(
    res,
    { user: user.profile, previousRole },
    `User role changed from "${previousRole}" to "${role}". All sessions invalidated.`,
  );
});

export const forceVerifyEmail = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const user = await AdminService.forceVerifyEmail(userId, req.user.role);

  return ApiResponseUtil.success(
    res,
    { user: user.profile },
    "Email verified successfully",
  );
});

export const adminInitiatePasswordReset = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const { user, rawToken } = await AdminService.adminInitiatePasswordReset(
    userId,
    req.user.role,
  );

  emailService
    .sendPasswordResetEmail(user.email, user.name, rawToken)
    .catch((err) =>
      console.error("[adminInitiatePasswordReset] Email failed:", err.message),
    );

  return ApiResponseUtil.success(
    res,
    {
      ...(process.env.NODE_ENV === "development" && {
        _devResetToken: rawToken,
      }),
    },
    `Password reset email sent to ${user.email}`,
  );
});

export const deleteUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const result = await AdminService.deleteUser(userId, req.user.userId);
  return ApiResponseUtil.success(res, result, "User deleted permanently");
});

// ─── Admin Management (Superadmin only) ──────────────────────────────────────

export const createAdmin = asyncHandler(async (req, res) => {
  const { name, username, email, password } = req.body;

  const admin = await AdminService.createAdmin({
    name,
    username,
    email,
    password,
  });

  emailService
    .sendWelcomeEmail(admin.email, admin.name, admin.username)
    .catch((err) =>
      console.error("[createAdmin] Welcome email failed:", err.message),
    );

  return ApiResponseUtil.created(
    res,
    { admin: admin.profile },
    "Admin account created successfully",
  );
});

export const listAdmins = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await AdminService.listAdmins({ page, limit });
  return ApiResponseUtil.success(res, result);
});

// ─── Business Management ──────────────────────────────────────────────────────

export const listBusinesses = asyncHandler(async (req, res) => {
  const { page, limit, isActive, onboardingComplete, type, city, search } =
    req.query;

  const result = await AdminService.listBusinesses({
    page,
    limit,
    isActive,
    onboardingComplete,
    type,
    city,
    search,
  });

  return ApiResponseUtil.success(res, result);
});

export const getBusinessDetail = asyncHandler(async (req, res) => {
  const { businessId } = req.params;
  const business = await AdminService.getBusinessDetail(businessId);
  return ApiResponseUtil.success(res, { business });
});

export const setBusinessActiveStatus = asyncHandler(async (req, res) => {
  const { businessId } = req.params;
  const { isActive } = req.body;

  const business = await AdminService.setBusinessActiveStatus(
    businessId,
    isActive,
  );

  const action = isActive ? "activated" : "deactivated";
  return ApiResponseUtil.success(
    res,
    { business },
    `Business ${action} successfully`,
  );
});

export const setBusinessVerified = asyncHandler(async (req, res) => {
  const { businessId } = req.params;
  const { isVerified } = req.body;

  const business = await AdminService.setBusinessVerified(
    businessId,
    isVerified,
  );

  const action = isVerified ? "verified" : "unverified";
  return ApiResponseUtil.success(
    res,
    { business },
    `Business marked as ${action}`,
  );
});

export const upgradePlan = asyncHandler(async (req, res) => {
  const { businessId } = req.params;
  const { newPlan, paymentMethod } = req.body;

  const business = await AdminService.upgradePlan(
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
    `Business plan updated to "${newPlan}" successfully`,
  );
});

export const forceAdvanceOnboarding = asyncHandler(async (req, res) => {
  const { businessId } = req.params;
  const { step } = req.body;

  const business = await AdminService.forceAdvanceOnboarding(businessId, step);

  return ApiResponseUtil.success(
    res,
    { business },
    `Business onboarding advanced to step ${step}`,
  );
});
