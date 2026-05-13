import { Router } from "express";

import {
  getMyBusiness,
  getOnboardingStatus,
  getDashboard,
  onboardStep1,
  onboardStep2,
  onboardStep3,
  onboardStep4,
  onboardStep5,
  updateProfile,
  updateSettings,
  updateWorkingHoursDay,
  updateEngagement,
  getPlan,
  upgradePlan,
  listBusinesses,
} from "../../../controllers/business.controller.js";

import {
  step1Validator,
  step2Validator,
  step3Validator,
  step4Validator,
  step5Validator,
  profileUpdateValidator,
  settingsValidator,
  workingHoursDayValidator,
  engagementValidator,
  planUpgradeValidator,
  listBusinessesValidator,
  validate,
} from "../../../utils/validators/business.validator.js";

import {
  verifyToken,
  requireVerifiedEmail,
  requireAdmin,
} from "../../../middlewares/auth.middleware.js";

// ─── Business Router (owner/staff) ────────────────────────────────────────────

const router = Router();

// All routes in this router require a verified email + access token
router.use(verifyToken, requireVerifiedEmail);

// ── Read ─────────────────────────────────────────────────────────────────────

router.get("/me", getMyBusiness);
router.get("/dashboard", getDashboard);
router.get("/plan", getPlan);

// ── Onboarding ────────────────────────────────────────────────────────────────

router.get("/onboarding/status", getOnboardingStatus);

router.patch("/onboarding/step-1", step1Validator, validate, onboardStep1);
router.patch("/onboarding/step-2", step2Validator, validate, onboardStep2);
router.patch("/onboarding/step-3", step3Validator, validate, onboardStep3);
router.patch("/onboarding/step-4", step4Validator, validate, onboardStep4);
router.patch("/onboarding/step-5", step5Validator, validate, onboardStep5);

// ── Post-Onboarding Updates ───────────────────────────────────────────────────

router.patch("/profile", profileUpdateValidator, validate, updateProfile);
router.patch("/settings", settingsValidator, validate, updateSettings);

router.patch(
  "/working-hours/:day",
  workingHoursDayValidator,
  validate,
  updateWorkingHoursDay,
);

router.patch("/engagement", engagementValidator, validate, updateEngagement);

export default router;
