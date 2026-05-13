import { Router } from "express";

import {
  getSystemStats,
  listUsers,
  getUserDetail,
  setUserActiveStatus,
  changeUserRole,
  forceVerifyEmail,
  adminInitiatePasswordReset,
  deleteUser,
  createAdmin,
  listAdmins,
  listBusinesses,
  getBusinessDetail,
  setBusinessActiveStatus,
  setBusinessVerified,
  upgradePlan,
  forceAdvanceOnboarding,
} from "../../../controllers/admin.controller.js";

import {
  listUsersValidator,
  listBusinessesValidator,
  listAdminsValidator,
  userIdParamValidator,
  businessIdParamValidator,
  setActiveStatusValidator,
  changeRoleValidator,
  createAdminValidator,
  upgradePlanValidator,
  forceAdvanceOnboardingValidator,
  setVerifiedValidator,
  validate,
} from "../../../utils/validators/admin.validator.js";

import {
  verifyToken,
  requireAdmin,
  requireSuperAdmin, // must be exported from auth.middleware.js
} from "../../../middlewares/auth.middleware.js";

// ─── Admin Router ─────────────────────────────────────────────────────────────
const adminRouter = Router();
adminRouter.use(verifyToken, requireAdmin);

adminRouter.get("/stats", getSystemStats);

adminRouter.get("/users", listUsersValidator, validate, listUsers);
adminRouter.get(
  "/users/:userId",
  userIdParamValidator,
  validate,
  getUserDetail,
);
adminRouter.patch(
  "/users/:userId/status",
  [...userIdParamValidator, ...setActiveStatusValidator],
  validate,
  setUserActiveStatus,
);
adminRouter.patch(
  "/users/:userId/role",
  [...userIdParamValidator, ...changeRoleValidator],
  validate,
  changeUserRole,
);
adminRouter.post(
  "/users/:userId/verify-email",
  userIdParamValidator,
  validate,
  forceVerifyEmail,
);
adminRouter.post(
  "/users/:userId/reset-password",
  userIdParamValidator,
  validate,
  adminInitiatePasswordReset,
);

adminRouter.get(
  "/businesses",
  listBusinessesValidator,
  validate,
  listBusinesses,
);
adminRouter.get(
  "/businesses/:businessId",
  businessIdParamValidator,
  validate,
  getBusinessDetail,
);
adminRouter.patch(
  "/businesses/:businessId/status",
  [...businessIdParamValidator, ...setActiveStatusValidator],
  validate,
  setBusinessActiveStatus,
);
adminRouter.patch(
  "/businesses/:businessId/verify",
  [...businessIdParamValidator, ...setVerifiedValidator],
  validate,
  setBusinessVerified,
);
adminRouter.post(
  "/businesses/:businessId/upgrade-plan",
  [...businessIdParamValidator, ...upgradePlanValidator],
  validate,
  upgradePlan,
);
adminRouter.patch(
  "/businesses/:businessId/onboarding",
  [...businessIdParamValidator, ...forceAdvanceOnboardingValidator],
  validate,
  forceAdvanceOnboarding,
);

export default adminRouter;

// ─── Superadmin Router ────────────────────────────────────────────────────────
export const superAdminRouter = Router();
superAdminRouter.use(verifyToken, requireSuperAdmin);

superAdminRouter.post("/admins", createAdminValidator, validate, createAdmin);
superAdminRouter.get("/admins", listAdminsValidator, validate, listAdmins);
superAdminRouter.delete(
  "/users/:userId",
  userIdParamValidator,
  validate,
  deleteUser,
);
