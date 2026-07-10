/**
 * utils/auth/jwtHelper.utils.js
 *
 * Pure utility — only signs and verifies tokens.
 * Token GENERATION lives on the User model methods:
 *   user.generateAuthToken()       → uses JWT_ACCESS_SECRET + JWT_EXPIRES_IN
 *   user.generateRefreshToken()    → uses JWT_REFRESH_SECRET + REFRESH_TOKEN_EXPIRY_DAYS
 *
 * This file handles VERIFICATION and cookie config only.
 * Env var names match exactly what the model uses.
 */

import jwt from "jsonwebtoken";
import { env } from "../../lib/env.js";

// Access Token

/**
 * Verify an access token.
 * Throws JsonWebTokenError | TokenExpiredError | NotBeforeError on failure.
 * @param {string} token
 * @returns {{ userId, email, role, businessId, tokenVersion, iat, exp }}
 */

export const verifyAccessToken = (token) => {
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
};

// Refresh Token

/**
 * Verify a refresh token signature and expiry.
 * Does NOT check DB hash — that's done separately in auth.service.js.
 * @param {string} token
 * @returns {{ _id, type, tokenId, tokenVersion, iat, exp }}
 */

export const verifyRefreshToken = (token) => {
  return jwt.verify(token, env.JWT_REFRESH_SECRET);
};

// Cookie Config

const REFRESH_EXPIRY_DAYS = parseInt(env.REFRESH_TOKEN_EXPIRY_DAYS) || 7;

/**
 * httpOnly cookie options for the refresh token.
 * - httpOnly: JS cannot read it → XSS-safe
 * - secure: HTTPS only in production
 * - sameSite: CSRF mitigation
 * - path: Scoped to /api/v1/auth so cookie isn't sent on every request
 */

export const refreshCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: env.NODE_ENV === "production" ? "none" : "lax",
  maxAge: REFRESH_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  path: "/api/v1/auth",
};

/**
 * Options to clear the refresh token cookie.
 * path must match the original cookie's path.
 */

export const clearCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: env.NODE_ENV === "production" ? "strict" : "lax",
  path: "/api/v1/auth",
};
