/**
 * services/admin.service.js
 *
 * Business logic for the admin panel.
 * Two tiers of operations:
 *
 *   Admin-level  — manage owners/staff, view businesses, upgrade plans, impersonate
 *   Superadmin   — create/manage admins, system stats, seed superadmin
 *
 * No req/res here — pure functions that throw AppError on failure.
 * Pattern is identical to auth.service.js and business.service.js.
 */

import crypto from "crypto";
import User from "../models/user.model.js";
import Business from "../models/business/business.model.js";
import { AppError } from "../utils/helpers/errorHandler.utils.js";

// ─── Role hierarchy helpers ───────────────────────────────────────────────────

const ROLE_RANK = { staff: 1, owner: 2, admin: 3, superadmin: 4 };

const assertCanModify = (actorRole, targetRole) => {
  if (ROLE_RANK[actorRole] <= ROLE_RANK[targetRole]) {
    throw new AppError(
      "You do not have permission to modify a user with an equal or higher role.",
      403,
    );
  }
};

const assertCanAssignRole = (actorRole, newRole) => {
  const allowed = {
    superadmin: ["superadmin", "admin", "owner", "staff"],
    admin: ["owner", "staff"],
  };

  if (!allowed[actorRole]?.includes(newRole)) {
    throw new AppError(
      `Your role (${actorRole}) cannot assign the role "${newRole}".`,
      403,
    );
  }
};

// ─── User Management (Admin + Superadmin) ────────────────────────────────────

export const listUsers = async ({
  page = 1,
  limit = 20,
  role,
  isActive,
  isEmailVerified,
  search,
  actorRole,
} = {}) => {
  const filter = {};

  if (actorRole === "admin") {
    filter.role = { $ne: "superadmin" };
  }

  if (role) {
    if (actorRole === "admin" && role === "superadmin") {
      throw new AppError("Access denied.", 403);
    }
    filter.role = role;
  }

  if (isActive !== undefined) {
    filter.isActive = isActive === "true" || isActive === true;
  }
  if (isEmailVerified !== undefined) {
    filter.isEmailVerified =
      isEmailVerified === "true" || isEmailVerified === true;
  }

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { username: { $regex: search, $options: "i" } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [users, total] = await Promise.all([
    User.find(filter)
      .select(
        "name username email role isActive isEmailVerified businessId lastLoginAt createdAt",
      )
      .skip(skip)
      .limit(Number(limit))
      .sort({ createdAt: -1 })
      .lean(),
    User.countDocuments(filter),
  ]);

  return {
    users,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / Number(limit)),
    },
  };
};

export const getUserDetail = async (targetUserId, actorRole) => {
  const user = await User.findById(targetUserId).select(
    "name username email phone profilePicture role isActive isEmailVerified businessId lastLoginAt createdAt updatedAt consentToDataProcessing dataRetentionDate",
  );

  if (!user) throw new AppError("User not found", 404);
  if (actorRole === "admin" && user.role === "superadmin") {
    throw new AppError("Access denied.", 403);
  }

  let business = null;
  if (user.businessId) {
    business = await Business.findById(user.businessId).select(
      "name type city onboardingStep onboardingComplete isActive plan.currentPlan whatsapp.connectionStatus createdAt",
    );
  }

  return { user, business };
};

export const setUserActiveStatus = async (
  targetUserId,
  isActive,
  actorRole,
) => {
  const user = await User.findById(targetUserId).select(
    "+refreshTokens +tokenVersion",
  );

  if (!user) throw new AppError("User not found", 404);
  assertCanModify(actorRole, user.role);

  user.isActive = isActive;

  if (!isActive) {
    user.refreshTokens = [];
    user.markModified("refreshTokens");
    user.tokenVersion = (user.tokenVersion || 1) + 1;
    user.markModified("tokenVersion"); // ✅ ensure Mongoose sees the change
  }

  await user.save();
  return user;
};

export const changeUserRole = async (targetUserId, newRole, actorRole) => {
  const user = await User.findById(targetUserId).select(
    "+refreshTokens +tokenVersion",
  );

  if (!user) throw new AppError("User not found", 404);
  assertCanModify(actorRole, user.role);
  assertCanAssignRole(actorRole, newRole);

  if (user.role === newRole) {
    throw new AppError(`User already has the role "${newRole}".`, 409);
  }

  const previousRole = user.role;
  user.role = newRole;

  user.refreshTokens = [];
  user.markModified("refreshTokens");
  user.tokenVersion = (user.tokenVersion || 1) + 1;
  user.markModified("tokenVersion"); // ✅ ensure Mongoose sees the change

  await user.save();
  return { user, previousRole };
};

export const forceVerifyEmail = async (targetUserId, actorRole) => {
  const user = await User.findById(targetUserId).select(
    "+verificationToken +verificationTokenExpiry",
  );

  if (!user) throw new AppError("User not found", 404);
  assertCanModify(actorRole, user.role);

  if (user.isEmailVerified) {
    throw new AppError("Email is already verified.", 409);
  }

  user.isEmailVerified = true;
  user.verificationToken = undefined;
  user.verificationTokenExpiry = undefined;

  await user.save();
  return user;
};

export const adminInitiatePasswordReset = async (targetUserId, actorRole) => {
  const user = await User.findById(targetUserId).select(
    "+resetPasswordToken +resetPasswordExpiry",
  );

  if (!user) throw new AppError("User not found", 404);
  assertCanModify(actorRole, user.role);

  const rawToken = crypto.randomBytes(32).toString("hex");
  user.resetPasswordToken = crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex");
  user.resetPasswordExpiry = Date.now() + 60 * 60 * 1000;

  await user.save();
  return { user, rawToken };
};

export const deleteUser = async (targetUserId, actorUserId) => {
  if (targetUserId === actorUserId) {
    throw new AppError("You cannot delete your own account.", 403);
  }

  const user = await User.findById(targetUserId);
  if (!user) throw new AppError("User not found", 404);

  if (user.businessId) {
    await Business.findByIdAndDelete(user.businessId);
  }

  await User.findByIdAndDelete(targetUserId);
  return { deletedUserId: targetUserId, deletedBusinessId: user.businessId };
};

// ─── Admin Management (Superadmin only) ──────────────────────────────────────

export const createAdmin = async ({ name, username, email, password }) => {
  const [emailTaken, usernameTaken] = await Promise.all([
    User.findOne({ email }),
    User.findOne({ username }),
  ]);

  if (emailTaken) throw new AppError("Email is already registered.", 409);
  if (usernameTaken) throw new AppError("Username is already taken.", 409);

  const admin = await User.create({
    name,
    username,
    email,
    password,
    role: "admin",
    isEmailVerified: true,
    consentToDataProcessing: true,
  });

  return admin;
};

export const listAdmins = async ({ page = 1, limit = 20 } = {}) => {
  const skip = (Number(page) - 1) * Number(limit);

  const [admins, total] = await Promise.all([
    User.find({ role: "admin" })
      .select("name username email isActive lastLoginAt createdAt")
      .skip(skip)
      .limit(Number(limit))
      .sort({ createdAt: -1 })
      .lean(),
    User.countDocuments({ role: "admin" }),
  ]);

  return {
    admins,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / Number(limit)),
    },
  };
};

// ─── Business Management (Admin + Superadmin) ────────────────────────────────

export const listBusinesses = async ({
  page = 1,
  limit = 20,
  isActive,
  onboardingComplete,
  type,
  city,
  search,
} = {}) => {
  const filter = {};

  if (isActive !== undefined)
    filter.isActive = isActive === "true" || isActive === true;
  if (onboardingComplete !== undefined)
    filter.onboardingComplete =
      onboardingComplete === "true" || onboardingComplete === true;
  if (type) filter.type = type;
  if (city) filter.city = city;

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { slug: { $regex: search, $options: "i" } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [businesses, total] = await Promise.all([
    Business.find(filter)
      .select(
        "name type city slug onboardingStep onboardingComplete isActive isVerified plan.currentPlan plan.isTrial whatsapp.connectionStatus ownerId createdAt",
      )
      .populate("ownerId", "name email")
      .skip(skip)
      .limit(Number(limit))
      .sort({ createdAt: -1 })
      .lean(),
    Business.countDocuments(filter),
  ]);

  return {
    businesses,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / Number(limit)),
    },
  };
};

export const getBusinessDetail = async (businessId) => {
  const business = await Business.findById(businessId)
    .populate("ownerId", "name username email phone lastLoginAt createdAt")
    .populate("staffIds", "name username email lastLoginAt");

  if (!business) throw new AppError("Business not found", 404);
  return business;
};

export const setBusinessActiveStatus = async (businessId, isActive) => {
  const business = await Business.findById(businessId);
  if (!business) throw new AppError("Business not found", 404);

  business.isActive = isActive;
  await business.save();
  return business;
};

export const setBusinessVerified = async (businessId, isVerified) => {
  const business = await Business.findById(businessId);
  if (!business) throw new AppError("Business not found", 404);

  business.isVerified = isVerified;
  await business.save();
  return business;
};

export const upgradePlan = async (businessId, newPlan, paymentMethod) => {
  const VALID_PLANS = ["free", "starter", "growth", "enterprise"];
  if (!VALID_PLANS.includes(newPlan)) {
    throw new AppError(
      `Invalid plan "${newPlan}". Valid: ${VALID_PLANS.join(", ")}`,
      422,
    );
  }

  const business = await Business.findById(businessId);
  if (!business) throw new AppError("Business not found", 404);

  business.plan.upgradeTo(newPlan);
  if (paymentMethod) business.plan.paymentMethod = paymentMethod;
  business.plan.lastPaymentAt = new Date();
  business.markModified("plan");

  await business.save();
  return business;
};

export const forceAdvanceOnboarding = async (businessId, step) => {
  if (step < 1 || step > 5) {
    throw new AppError("Step must be between 1 and 5.", 422);
  }

  const business = await Business.findById(businessId);
  if (!business) throw new AppError("Business not found", 404);

  business.onboardingStep = step;

  if (step >= 5) {
    business.onboardingComplete = true;
    business.onboardingCompletedAt =
      business.onboardingCompletedAt || new Date();
  }

  await business.save();
  return business;
};

// ─── System Stats (Admin + Superadmin) ───────────────────────────────────────

export const getSystemStats = async () => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    totalUsers,
    activeUsers,
    newUsersLast7Days,
    newUsersLast30Days,
    verifiedUsers,
    totalBusinesses,
    activeBusinesses,
    onboardedBusinesses,
    newBusinessesLast30Days,
    whatsappConnected,
    planDistribution,
    roleDistribution,
  ] = await Promise.all([
    User.countDocuments({ role: { $in: ["owner", "staff"] } }),
    User.countDocuments({ role: { $in: ["owner", "staff"] }, isActive: true }),
    User.countDocuments({
      role: { $in: ["owner", "staff"] },
      createdAt: { $gte: sevenDaysAgo },
    }),
    User.countDocuments({
      role: { $in: ["owner", "staff"] },
      createdAt: { $gte: thirtyDaysAgo },
    }),
    User.countDocuments({
      role: { $in: ["owner", "staff"] },
      isEmailVerified: true,
    }),
    Business.countDocuments(),
    Business.countDocuments({ isActive: true }),
    Business.countDocuments({ onboardingComplete: true }),
    Business.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
    Business.countDocuments({ "whatsapp.connectionStatus": "connected" }),
    Business.aggregate([
      { $group: { _id: "$plan.currentPlan", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    User.aggregate([
      { $group: { _id: "$role", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
  ]);

  return {
    users: {
      total: totalUsers,
      active: activeUsers,
      inactive: totalUsers - activeUsers,
      verified: verifiedUsers,
      unverified: totalUsers - verifiedUsers,
      newLast7Days: newUsersLast7Days,
      newLast30Days: newUsersLast30Days,
    },
    businesses: {
      total: totalBusinesses,
      active: activeBusinesses,
      inactive: totalBusinesses - activeBusinesses,
      onboarded: onboardedBusinesses,
      inProgress: totalBusinesses - onboardedBusinesses,
      whatsappConnected,
      newLast30Days: newBusinessesLast30Days,
    },
    plans: planDistribution.reduce((acc, p) => {
      acc[p._id || "unknown"] = p.count;
      return acc;
    }, {}),
    roles: roleDistribution.reduce((acc, r) => {
      acc[r._id] = r.count;
      return acc;
    }, {}),
  };
};
