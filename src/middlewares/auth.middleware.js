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
 */

import { verifyAccessToken } from "../utils/auth/jwtHelper.utils.js";
import User from "../models/user.model.js";
import ApiResponseUtil from "../utils/helpers/apiResponse.utils.js";
import { AppError, asyncHandler } from "../utils/helpers/errorHandler.utils.js";

// verifyToken

/**
 * Extracts Bearer token from Authorization header, verifies it,
 * then does DB-level checks for password changes and token version.
 *
 * Sets req.user = { userId, email, role, businessId, tokenVersion }
 */
export const verifyToken = asyncHandler(async (req, res, next) => {
  // ── 1. Extract token ───────────────────────────────────────────────────────
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return ApiResponseUtil.unauthorized(res, "Access token is required");
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return ApiResponseUtil.unauthorized(res, "Access token is required");
  }

  // ── 2. Verify signature and expiry ────────────────────────────────────────
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

  // ── 3. Confirm user still exists and is active ────────────────────────────
  // Also select passwordChangedAt and tokenVersion for the checks below
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

  // ── 4. tokenVersion check — catches logoutAllDevices / incrementTokenVersion
  // Model stores tokenVersion; JWT payload carries it at issue time.
  // If they don't match, the token was issued before a forced invalidation.
  if (
    decoded.tokenVersion !== undefined &&
    decoded.tokenVersion !== user.tokenVersion
  ) {
    return ApiResponseUtil.unauthorized(
      res,
      "Your session has been invalidated. Please login again.",
    );
  }

  // ── 5. changedPasswordAfter — rejects tokens issued before a password change
  // Model method: returns true if passwordChangedAt > JWTTimestamp
  if (user.changedPasswordAfter(decoded.iat)) {
    return ApiResponseUtil.unauthorized(
      res,
      "Password was recently changed. Please login again.",
    );
  }

  // ── 6. Attach minimal user context to request ─────────────────────────────
  req.user = {
    userId: decoded.userId,
    email: decoded.email,
    role: decoded.role,
    businessId: decoded.businessId,
    tokenVersion: decoded.tokenVersion,
  };

  next();
});

// optionalAuth

/**
 * Like verifyToken but doesn't block unauthenticated requests.
 * Sets req.user if a valid token is present, otherwise req.user = null.
 * Useful for routes that behave differently for auth vs guest users.
 */
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

// requireRole

/**
 * Role-based access control. Must come after verifyToken.
 *
 * Usage:
 *   router.delete("/user/:id", verifyToken, requireRole("admin"), handler)
 *   router.post("/booking", verifyToken, requireRole("owner", "admin"), handler)
 *
 * @param {...string} roles - Allowed roles from model enum: "owner" | "staff" | "admin"
 */
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

// Convenience role middlewares

/** Owner or admin only */
export const requireOwner = requireRole("owner", "admin");

/** Any authenticated staff member (owner, staff, admin) */
export const requireStaff = requireRole("owner", "staff", "admin");

/** Super admin only */
export const requireAdmin = requireRole("admin");

// requireVerifiedEmail

/**
 * Blocks access if the user hasn't verified their email yet.
 * Must come after verifyToken (needs req.user).
 *
 * Usage:
 *   router.post("/campaign", verifyToken, requireVerifiedEmail, handler)
 */
export const requireVerifiedEmail = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.userId).select("isEmailVerified");

  if (!user?.isEmailVerified) {
    return ApiResponseUtil.forbidden(
      res,
      "Please verify your email address before accessing this feature.",
    );
  }

  next();
});
