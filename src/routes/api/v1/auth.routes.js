/**
 * routes/api/v1/auth.routes.js
 *
 * Route order matters:
 *   1. validator array  — runs express-validator rules
 *   2. validate         — short-circuits with 422 on validation failure
 *   3. [middleware]     — verifyToken where route is protected
 *   4. controller       — asyncHandler-wrapped business logic
 *
 *  All routes under /api/v1/auth
 */

import { Router } from "express";
import {
  register,
  login,
  refreshToken,
  logout,
  logoutAll,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  changePassword,
  getSessions,
  getMe,
} from "../../../controllers/auth.controller.js";

import {
  registerValidator,
  loginValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  changePasswordValidator,
  validate,
} from "../../../utils/validators/auth.validator.js";

import {
  verifyToken,
  requireVerifiedEmail,
} from "../../../middlewares/auth.middleware.js";

const router = Router();

// Public Routes

/**
 * POST /api/v1/auth/register
 * Validate → create user + business → return tokens
 */
router.post("/register", registerValidator, validate, register);

/**
 * POST /api/v1/auth/login
 * Validate → check credentials → handle lock → return tokens
 */
router.post("/login", loginValidator, validate, login);

/**
 * POST /api/v1/auth/refresh
 * Read cookie → verify RT → rotate → return new access token
 * No validator needed — token comes from cookie, not body
 */
router.post("/refresh", refreshToken);

/**
 * POST /api/v1/auth/logout
 * Remove current device's RT from DB → clear cookie
 * Works without auth (cookie may still be present after access token expires)
 */
router.post("/logout", logout);

/**
 * GET /api/v1/auth/verify-email/:token
 * Raw token from email link → hash → compare → mark verified
 */
router.get("/verify-email/:token", verifyEmail);

/**
 * POST /api/v1/auth/forgot-password
 * Validate email → generate reset token → (send email) → always 200
 */
router.post(
  "/forgot-password",
  forgotPasswordValidator,
  validate,
  forgotPassword,
);

/**
 * POST /api/v1/auth/reset-password
 * Validate token + new password → reset → clear sessions
 */
router.post("/reset-password", resetPasswordValidator, validate, resetPassword);

// Protected Routes (require valid access token)

/**
 * GET /api/v1/auth/me
 * Returns current user's profile virtual
 */
router.get("/me", verifyToken, getMe);

/**
 * POST /api/v1/auth/logout-all
 * Wipe all sessions + increment tokenVersion
 */
router.post("/logout-all", verifyToken, logoutAll);

/**
 * POST /api/v1/auth/resend-verification
 * Generate new verification token → (send email)
 */
router.post("/resend-verification", verifyToken, resendVerification);

/**
 * POST /api/v1/auth/change-password
 * Requires: valid token + verified email + current password
 * Pre-save hook enforces no reuse of last 3 passwords
 */
router.post(
  "/change-password",
  verifyToken,
  requireVerifiedEmail,
  changePasswordValidator,
  validate,
  changePassword,
);

/**
 * GET /api/v1/auth/sessions
 * Returns active sessions from refreshTokens[] array
 */
router.get("/sessions", verifyToken, getSessions);

export default router;
