/**
 * middleware/auth.middleware.js
 *
 * verifyToken — protects routes, sets req.user from JWT payload
 * requireRole — role-based access control
 * optionalAuth — populates req.user if token present, doesn't block if absent
 *
 * Security checks that go BEYOND simple JWT verification:
 *   1. tokenVersion — invalidated if user calls logoutAllDevices / changePassword
 *   2. changedPasswordAfter — token issued before a password change is rejected
 *   3. isActive — deactivated accounts are blocked even with a valid token
 *
 * Role hierarchy (highest → lowest):
 *   superadmin → admin → owner → staff
 */

import { verifyAccessToken } from "../utils/auth/jwtHelper.utils.js";
import User from "../models/user.model.js";
import ApiResponseUtil from "../utils/helpers/apiResponse.utils.js";
import { AppError, asyncHandler } from "../utils/helpers/errorHandler.utils.js";

// ─── verifyToken ──────────────────────────────────────────────────────────────

export const verifyToken = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return ApiResponseUtil.unauthorized(res, "Access token is required");
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return ApiResponseUtil.unauthorized(res, "Access token is required");
  }

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return ApiResponseUtil.unauthorized(
        res,
        "Access token has expired. Please refresh your session.",
      );
    }
    return ApiResponseUtil.unauthorized(res, "Invalid access token");
  }

  const user = await User.findById(decoded.userId).select(
    "+passwordChangedAt +tokenVersion",
  );

  if (!user) {
    return ApiResponseUtil.unauthorized(
      res,
      "The user associated with this token no longer exists",
    );
  }

  if (!user.isActive) {
    return ApiResponseUtil.forbidden(
      res,
      "Your account has been deactivated. Contact support.",
    );
  }

  if (
    decoded.tokenVersion !== undefined &&
    decoded.tokenVersion !== user.tokenVersion
  ) {
    return ApiResponseUtil.unauthorized(
      res,
      "Your session has been invalidated. Please login again.",
    );
  }

  if (user.changedPasswordAfter(decoded.iat)) {
    return ApiResponseUtil.unauthorized(
      res,
      "Password was recently changed. Please login again.",
    );
  }

  req.user = {
    userId: decoded.userId,
    email: decoded.email,
    role: decoded.role,
    businessId: decoded.businessId,
    tokenVersion: decoded.tokenVersion,
  };

  next();
});

// ─── optionalAuth ─────────────────────────────────────────────────────────────

export const optionalAuth = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    req.user = null;
    return next();
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.userId).select(
      "+passwordChangedAt +tokenVersion",
    );

    if (
      user &&
      user.isActive &&
      decoded.tokenVersion === user.tokenVersion &&
      !user.changedPasswordAfter(decoded.iat)
    ) {
      req.user = {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        businessId: decoded.businessId,
        tokenVersion: decoded.tokenVersion,
      };
    } else {
      req.user = null;
    }
  } catch {
    req.user = null;
  }

  next();
});

// ─── requireRole ──────────────────────────────────────────────────────────────

export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return ApiResponseUtil.unauthorized(res, "Authentication required");
    }

    if (!roles.includes(req.user.role)) {
      return ApiResponseUtil.forbidden(
        res,
        `Access denied. Required role: ${roles.join(" or ")}`,
      );
    }

    next();
  };
};

// ─── Convenience role middlewares ─────────────────────────────────────────────

/** Owner or above (owner, admin, superadmin). Blocks staff. */
export const requireOwner = requireRole("owner", "admin", "superadmin");

/** Any authenticated staff member (all roles). */
export const requireStaff = requireRole(
  "owner",
  "staff",
  "admin",
  "superadmin",
);

/** Admin or superadmin — platform management routes. */
export const requireAdmin = requireRole("admin", "superadmin"); // ✅ updated

/** Superadmin only — highest privilege level. */
export const requireSuperAdmin = requireRole("superadmin"); // ✅ added

// ─── requireVerifiedEmail ─────────────────────────────────────────────────────

export const requireVerifiedEmail = asyncHandler(async (req, res, next) => {
  // ✅ Admin-tier users bypass email verification
  if (["superadmin", "admin"].includes(req.user.role)) {
    return next();
  }

  const user = await User.findById(req.user.userId).select("isEmailVerified");

  if (!user?.isEmailVerified) {
    return ApiResponseUtil.forbidden(
      res,
      "Please verify your email address before accessing this feature.",
    );
  }

  next();
});
