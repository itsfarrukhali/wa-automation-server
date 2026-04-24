/**
 * controllers/auth.controller.js
 *
 * Thin HTTP layer — reads req, calls auth.service.js, writes res.
 * No business logic here. Error handling via asyncHandler → global handler.
 */

import { asyncHandler } from "../utils/helpers/errorHandler.utils.js";
import ApiResponseUtil from "../utils/helpers/apiResponse.utils.js";
import {
  refreshCookieOptions,
  clearCookieOptions,
} from "../utils/auth/jwtHelper.utils.js";
import * as emailService from "../services/email.service.js";
import * as AuthService from "../services/auth.service.js";
import User from "../models/user.model.js";

// Helpers

const extractDeviceInfo = (req) => ({
  userAgent: req.headers["user-agent"] || "unknown",
  platform: req.headers["sec-ch-ua-platform"]?.replace(/"/g, "") || "unknown",
  ip: req.ip || req.socket?.remoteAddress || "unknown",
});

const setRefreshCookie = (res, token) => {
  res.cookie("refreshToken", token, refreshCookieOptions);
};

const clearRefreshCookie = (res) => {
  res.clearCookie("refreshToken", clearCookieOptions);
};

const resolveRefreshTokenFromRequest = (req) => {
  const candidate =
    req.cookies?.refreshToken ||
    req.headers["x-refresh-token"] ||
    req.body?.refreshToken ||
    "";

  if (typeof candidate !== "string") return "";

  return candidate.replace(/^Bearer\s+/i, "").trim();
};

// Register

/**
 * POST /api/v1/auth/register
 */
export const register = asyncHandler(async (req, res) => {
  const {
    email,
    username,
    password,
    name,
    consentToDataProcessing,
    businessName,
    businessType,
  } = req.body;

  const deviceInfo = extractDeviceInfo(req);

  const { user, accessToken, refreshToken, verificationToken } =
    await AuthService.registerUser(
      {
        email,
        username,
        password,
        name,
        businessName,
        businessType,
        consentToDataProcessing,
      },
      deviceInfo,
    );

  setRefreshCookie(res, refreshToken);

  // Fire-and-forget — don't let an email failure block the registration response
  emailService
    .sendVerificationEmail(user.email, user.name, verificationToken)
    .catch((err) =>
      console.error("[register] Verification email failed:", err.message),
    );

  return ApiResponseUtil.created(res, {
    accessToken,
    user: user.profile,
    ...(process.env.NODE_ENV === "development" && {
      _devVerificationToken: verificationToken,
    }),
  });
});

// Login

/**
 * POST /api/v1/auth/login
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const deviceInfo = extractDeviceInfo(req);

  const { user, accessToken, refreshToken } = await AuthService.loginUser(
    { email, password },
    deviceInfo,
  );

  setRefreshCookie(res, refreshToken);

  return ApiResponseUtil.success(
    res,
    { accessToken, user: user.profile },
    "Login successful",
  );
});

// Refresh Token

/**
 * POST /api/v1/auth/refresh
 */
export const refreshToken = asyncHandler(async (req, res) => {
  const incomingToken = resolveRefreshTokenFromRequest(req);

  if (!incomingToken) {
    return ApiResponseUtil.unauthorized(
      res,
      "No refresh token found. Please login.",
    );
  }

  const deviceInfo = extractDeviceInfo(req);

  const { accessToken, refreshToken: newRefreshToken } =
    await AuthService.refreshAccessToken(incomingToken, deviceInfo);

  setRefreshCookie(res, newRefreshToken);

  return ApiResponseUtil.success(res, { accessToken }, "Token refreshed");
});

// Logout

/**
 * POST /api/v1/auth/logout
 */
export const logout = asyncHandler(async (req, res) => {
  const token = resolveRefreshTokenFromRequest(req);

  await AuthService.logoutUser(token);

  clearRefreshCookie(res);

  return ApiResponseUtil.success(res, null, "Logged out successfully");
});

/**
 * POST /api/v1/auth/logout-all
 */
export const logoutAll = asyncHandler(async (req, res) => {
  await AuthService.logoutAllDevices(req.user.userId);

  clearRefreshCookie(res);

  return ApiResponseUtil.success(
    res,
    null,
    "Logged out from all devices successfully",
  );
});

// Email Verification

/**
 * GET /api/v1/auth/verify-email/:token
 */
export const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.params;

  if (!token) {
    return ApiResponseUtil.badRequest(res, "Verification token is required");
  }

  const user = await AuthService.verifyEmail(token);

  // Send welcome email after successful verification (fire-and-forget)
  emailService
    .sendWelcomeEmail(user.email, user.name, user.username)
    .catch((err) =>
      console.error("[verifyEmail] Welcome email failed:", err.message),
    );

  return ApiResponseUtil.success(
    res,
    { user: user.profile },
    "Email verified successfully",
  );
});

/**
 * POST /api/v1/auth/resend-verification
 */
export const resendVerification = asyncHandler(async (req, res) => {
  const { user, verificationToken } = await AuthService.resendVerificationEmail(
    req.user.userId,
  );

  emailService
    .sendVerificationEmail(user.email, user.name, verificationToken)
    .catch((err) =>
      console.error("[resendVerification] Email failed:", err.message),
    );

  return ApiResponseUtil.success(
    res,
    {
      ...(process.env.NODE_ENV === "development" && {
        _devVerificationToken: verificationToken,
      }),
    },
    "Verification email sent",
  );
});

// Password Reset

/**
 * POST /api/v1/auth/forgot-password
 *
 */
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const result = await AuthService.forgotPassword(email);

  if (result) {
    emailService
      .sendPasswordResetEmail(email, result.user.name, result.rawToken)
      .catch((err) =>
        console.error("[forgotPassword] Email failed:", err.message),
      );
  }

  // Always same response — user can't tell if email exists
  return ApiResponseUtil.success(
    res,
    {
      ...(process.env.NODE_ENV === "development" &&
        result && {
          _devResetToken: result.rawToken,
        }),
    },
    "If that email is registered, a password reset link has been sent.",
  );
});

/**
 * POST /api/v1/auth/reset-password
 */
export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;

  const user = await AuthService.resetPassword(token, password);

  clearRefreshCookie(res);

  // Security notification
  emailService
    .sendPasswordChangedEmail(user.email, user.name)
    .catch((err) =>
      console.error("[resetPassword] Notification email failed:", err.message),
    );

  return ApiResponseUtil.success(
    res,
    null,
    "Password reset successful. Please login with your new password.",
  );
});

/**
 * POST /api/v1/auth/change-password
 */
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await AuthService.changePassword(
    req.user.userId,
    currentPassword,
    newPassword,
  );

  clearRefreshCookie(res);

  // Security notification
  emailService
    .sendPasswordChangedEmail(user.email, user.name)
    .catch((err) =>
      console.error("[changePassword] Notification email failed:", err.message),
    );

  return ApiResponseUtil.success(
    res,
    null,
    "Password changed successfully. Please login again.",
  );
});

// Session Management

/**
 * GET /api/v1/auth/sessions
 */
export const getSessions = asyncHandler(async (req, res) => {
  const sessions = await AuthService.getActiveSessions(req.user.userId);

  return ApiResponseUtil.success(res, { sessions, count: sessions.length });
});

/**
 * GET /api/v1/auth/me
 */
export const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.userId);

  if (!user) {
    return ApiResponseUtil.notFound(res, "User not found");
  }

  return ApiResponseUtil.success(res, { user: user.profile });
});
