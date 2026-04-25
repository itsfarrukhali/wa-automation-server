/**
 * services/auth.service.js
 *
 *
 * Everything here maps directly to User model methods:
 *   generateAuthToken(), generateRefreshToken(), verifyRefreshToken(),
 *   comparePassword(), generateEmailVerificationToken(),
 *   incrementLoginAttempts(), resetLoginAttempts(),
 *   removeRefreshToken(), clearAllRefreshTokens(),
 *   incrementTokenVersion(), changedPasswordAfter()
 */

import crypto from "crypto";
import User from "../models/user.model.js";
import { AppError } from "../utils/helpers/errorHandler.utils.js";
import { verifyRefreshToken } from "../utils/auth/jwtHelper.utils.js";
import Business from "../models/business/business.model.js";

// Register

/**
 * Create a new user account.
 * Returns { user, accessToken, refreshToken } — caller sets the cookie.
 *
 * @param {{ email, username, password, name, consentToDataProcessing }} data
 * @param {object} deviceInfo - { userAgent, platform, ip }
 */

export const registerUser = async (data, deviceInfo = {}) => {
  const {
    email,
    username,
    password,
    name,
    businessName,
    businessType,
    consentToDataProcessing,
  } = data;

  // Check uniqueness before hitting Mongoose (cleaner error messages)
  const [emailTaken, usernameTaken] = await Promise.all([
    User.findOne({ email }),
    User.findOne({ username }),
  ]);

  if (emailTaken) throw new AppError("Email is already registered", 409);
  if (usernameTaken) throw new AppError("Username is already taken", 409);

  // Create user — pre-save hook hashes password + builds passwordHistory
  const user = await User.create({
    email,
    username,
    password,
    name,
    consentToDataProcessing,
    role: "owner", // First user of a business is always owner
  });

  // Create business and link to user
  const business = await Business.create({
    name: businessName,
    type: businessType,
    ownerId: user._id,
    onboardingStep: 1,
  });

  user.businessId = business._id;
  await user.save();

  // Generate email verification token (raw token goes in email, hash in DB)
  const verificationToken = user.generateEmailVerificationToken();
  await user.save();

  // Generate session tokens using model methods
  const accessToken = user.generateAuthToken();
  const refreshToken = user.generateRefreshToken(deviceInfo);
  await user.save(); // Save the new refreshToken entry

  return { user, accessToken, refreshToken, verificationToken };
};

// Login

/**
 * Authenticate user with email + password.
 * Handles account lock, login attempt tracking, and token generation.
 *
 * @param {{ email, password }} credentials
 * @param {object} deviceInfo
 */

export const loginUser = async ({ email, password }, deviceInfo = {}) => {
  // Must explicitly select password, loginAttempts, lockUntil (all select:false)
  const user = await User.findOne({ email }).select(
    "+password +loginAttempts +lockUntil +refreshTokens +tokenVersion",
  );

  // Account existence check
  // Generic error — don't reveal whether the email exists
  if (!user) {
    throw new AppError("Invalid email or password", 401);
  }

  // Account active check
  if (!user.isActive) {
    throw new AppError(
      "Your account has been deactivated. Contact support.",
      403,
    );
  }

  // Account Verified check
  if (!user.isEmailVerified) {
    throw new AppError(
      "Please verify your email address before accessing this feature.",
      403,
    );
  }

  // Account lock check
  // isLocked is a virtual on the model: lockUntil && lockUntil > Date.now()
  if (user.isLocked) {
    const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
    throw new AppError(
      `Account is temporarily locked. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? "s" : ""}.`,
      423, // 423 Locked
    );
  }

  // Password check
  const isPasswordCorrect = await user.comparePassword(password);

  if (!isPasswordCorrect) {
    // Increment attempts — model handles locking at MAX_ATTEMPTS (5)
    await user.incrementLoginAttempts();

    // Reload to get updated count for a helpful error message
    const updatedUser = await User.findById(user._id).select("+loginAttempts");
    const remaining = Math.max(0, 5 - (updatedUser?.loginAttempts || 0));

    const message =
      remaining > 0
        ? `Invalid email or password. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.`
        : "Too many failed attempts. Account is now locked for 30 minutes.";

    throw new AppError(message, 401);
  }

  // Success: reset counter and generate tokens
  await user.resetLoginAttempts(); // Sets loginAttempts=0, lockUntil=null, lastLoginAt=now

  const accessToken = user.generateAuthToken();
  const refreshToken = user.generateRefreshToken(deviceInfo);
  await user.save(); // Persist new refresh token entry

  return { user, accessToken, refreshToken };
};

// Refresh Token

/**
 * Rotate refresh token — verify incoming → issue new pair.
 * Uses the model's verifyRefreshToken() which checks hash + expiry
 * and updates usageCount + lastUsed.
 *
 * @param {string} incomingRefreshToken - Raw token from cookie
 * @param {object} deviceInfo
 */

export const refreshAccessToken = async (
  incomingRefreshToken,
  deviceInfo = {},
) => {
  // Step 1: Verify JWT signature + expiry
  let decoded;
  try {
    decoded = verifyRefreshToken(incomingRefreshToken);
  } catch (err) {
    // TokenExpiredError or JsonWebTokenError
    throw new AppError(
      "Invalid or expired refresh token. Please login again.",
      401,
    );
  }

  // Confirm payload type (model signs refresh tokens with type: "refresh")
  if (decoded.type !== "refresh") {
    throw new AppError("Invalid token type", 401);
  }

  // Step 2: Load user with refreshTokens (select:false by default)
  const user = await User.findById(decoded._id).select(
    "+refreshTokens +tokenVersion",
  );

  if (!user || !user.isActive) {
    throw new AppError("User not found or deactivated", 401);
  }

  // Step 3: Check tokenVersion — if incremented, all existing tokens are invalid
  if (decoded.tokenVersion !== user.tokenVersion) {
    throw new AppError("Session invalidated. Please login again.", 401);
  }

  // Step 4: Verify the hash exists in DB and update usage metrics
  // verifyRefreshToken() returns true and mutates usageCount + lastUsed
  const isValid = user.verifyRefreshToken(incomingRefreshToken);

  if (!isValid) {
    // Hash not found or expired — possible token reuse attack
    // Nuclear option: wipe ALL refresh tokens for this user
    await user.clearAllRefreshTokens();
    throw new AppError(
      "Refresh token is invalid or has already been used. All sessions invalidated for your security. Please login again.",
      401,
    );
  }

  // Step 5: Remove old token, issue new pair (rotation)
  await user.removeRefreshToken(incomingRefreshToken);

  const accessToken = user.generateAuthToken();
  const newRefreshToken = user.generateRefreshToken(deviceInfo);
  await user.save();

  return { user, accessToken, refreshToken: newRefreshToken };
};

// Logout

/**
 * Remove a single refresh token from DB (single-device logout).
 * @param {string} refreshToken - Raw token from cookie
 */
export const logoutUser = async (refreshToken) => {
  if (!refreshToken) return; // Already logged out / cookie missing

  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    return; // Expired token — nothing to revoke in DB
  }

  const user = await User.findById(decoded._id).select("+refreshTokens");
  if (!user) return;

  // removeRefreshToken hashes the incoming token and filters the array
  await user.removeRefreshToken(refreshToken);
};

/**
 * Logout from ALL devices — wipes entire refreshTokens array
 * and increments tokenVersion so any live access tokens fail
 * the changedPasswordAfter check on next protected request.
 * @param {string} userId
 */

export const logoutAllDevices = async (userId) => {
  const user = await User.findById(userId).select("+refreshTokens");
  if (!user) throw new AppError("User not found", 404);

  await user.clearAllRefreshTokens(); // Wipe all refresh tokens
  await user.incrementTokenVersion(); // Invalidate all outstanding access tokens
};

// Email Verification

/**
 * Verify email using the raw token sent in the verification email.
 * Model stores SHA256(token), so we hash incoming and compare.
 * @param {string} rawToken
 */

export const verifyEmail = async (rawToken) => {
  const hashedToken = crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex");

  const user = await User.findOne({
    verificationToken: hashedToken,
    verificationTokenExpiry: { $gt: Date.now() },
  }).select("+verificationToken +verificationTokenExpiry");

  if (!user) {
    throw new AppError(
      "Email verification token is invalid or has expired.",
      400,
    );
  }

  user.isEmailVerified = true;
  user.verificationToken = undefined;
  user.verificationTokenExpiry = undefined;
  await user.save();

  return user;
};

/**
 * Resend verification email — generates a fresh token.
 * @param {string} userId
 */

export const resendVerificationEmail = async (userId) => {
  const user = await User.findById(userId).select(
    "+verificationToken +verificationTokenExpiry",
  );

  if (!user) throw new AppError("User not found", 404);
  if (user.isEmailVerified)
    throw new AppError("Email is already verified", 400);

  const verificationToken = user.generateEmailVerificationToken();
  await user.save();

  return { user, verificationToken };
};

// Password Reset

/**
 * Initiate forgot-password flow — generate a reset token.
 * Returns raw token (caller sends this in the email link).
 * We do NOT throw if email not found — prevents user enumeration.
 * @param {string} email
 */

export const forgotPassword = async (email) => {
  const user = await User.findOne({ email }).select(
    "+resetPasswordToken +resetPasswordExpiry",
  );

  // Silent return — don't reveal whether this email is registered
  if (!user || !user.isActive) return null;

  // Generate reset token — model hashes + stores it, returns raw
  const rawToken = crypto.randomBytes(32).toString("hex");
  user.resetPasswordToken = crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex");
  user.resetPasswordExpiry = Date.now() + 60 * 60 * 1000; // 1 hour

  await user.save();

  return { user, rawToken };
};

/**
 * Complete password reset using the raw token from the email link.
 * @param {string} rawToken
 * @param {string} newPassword
 */

export const resetPassword = async (rawToken, newPassword) => {
  const hashedToken = crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex");

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpiry: { $gt: Date.now() },
  }).select(
    "+password +passwordHistory +resetPasswordToken +resetPasswordExpiry +refreshTokens +tokenVersion",
  );

  if (!user) {
    throw new AppError("Password reset token is invalid or has expired.", 400);
  }

  // Setting password triggers pre-save hook:
  // → checks passwordHistory (last 3)
  // → hashes new password
  // → appends to passwordHistory (keeps last 5)
  // → sets passwordChangedAt
  user.password = newPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpiry = undefined;

  // Security: invalidate every active session after password reset.
  user.refreshTokens = [];
  user.markModified("refreshTokens");
  user.tokenVersion = (user.tokenVersion || 1) + 1;

  await user.save();

  return user;
};

/**
 * Change password while authenticated — requires current password.
 * @param {string} userId
 * @param {string} currentPassword
 * @param {string} newPassword
 */

export const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await User.findById(userId).select(
    "+password +passwordHistory +refreshTokens +tokenVersion",
  );

  if (!user) throw new AppError("User not found", 404);

  const isCorrect = await user.comparePassword(currentPassword);
  if (!isCorrect) throw new AppError("Current password is incorrect", 401);

  // Pre-save hook will reject if newPassword matches last 3 hashes
  user.password = newPassword;

  // Security: invalidate every active session after password change.
  user.refreshTokens = [];
  user.markModified("refreshTokens");
  user.tokenVersion = (user.tokenVersion || 1) + 1;

  await user.save();

  return user;
};

// Session Management

/**
 * Get active sessions for the user's account management page.
 * Uses the model's getActiveSessions() method.
 * @param {string} userId
 */

export const getActiveSessions = async (userId) => {
  const user = await User.findById(userId).select("+refreshTokens");
  if (!user) throw new AppError("User not found", 404);

  return user.getActiveSessions();
};
