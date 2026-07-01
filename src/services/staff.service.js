import mongoose from "mongoose";
import Business from "../models/business/business.model.js";
import User from "../models/user.model.js";
import { getMyBusiness } from "./business.service.js";
import { AppError } from "../utils/helpers/errorHandler.utils.js";

const ensureObjectId = (id, label) => {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError(`Invalid ${label}`, 422);
  }
};

const publicStaffFields =
  "name email username phone profilePicture role businessId isActive isEmailVerified lastLoginAt createdAt updatedAt";

const getBusinessForOwner = async (userId) => getMyBusiness(userId);

const getStaffForBusiness = async (businessId, staffId) => {
  ensureObjectId(staffId, "staff ID");

  const staff = await User.findOne({
    _id: staffId,
    businessId,
    role: "staff",
  }).select(publicStaffFields);

  if (!staff) throw new AppError("Staff member not found", 404);
  return staff;
};

const updateActiveStaffUsage = async (businessId) => {
  const activeStaffCount = await User.countDocuments({
    businessId,
    role: "staff",
    isActive: true,
  });

  await Business.updateOne(
    { _id: businessId },
    {
      $set: {
        "plan.usage.activeStaffCount": activeStaffCount,
      },
    },
  );

  return activeStaffCount;
};

const assertCanAddStaff = async (business) => {
  const limit = business.plan?.limits?.staffAccounts ?? 0;
  if (limit === -1) return;

  const activeStaffCount = await User.countDocuments({
    businessId: business._id,
    role: "staff",
    isActive: true,
  });

  if (activeStaffCount >= limit) {
    throw new AppError(
      `Staff account limit reached for the ${business.plan?.currentPlan || "free"} plan.`,
      403,
    );
  }
};

export const listStaff = async (
  userId,
  { page = 1, limit = 20, isActive, search } = {},
) => {
  const business = await getBusinessForOwner(userId);
  const safePage = Number(page);
  const safeLimit = Number(limit);
  const filter = {
    businessId: business._id,
    role: "staff",
  };

  if (isActive !== undefined) filter.isActive = isActive === true || isActive === "true";
  if (search) {
    filter.$or = [
      { name: new RegExp(search, "i") },
      { email: new RegExp(search, "i") },
      { username: new RegExp(search, "i") },
      { phone: new RegExp(search, "i") },
    ];
  }

  const [staff, total, activeStaffCount] = await Promise.all([
    User.find(filter)
      .select(publicStaffFields)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit),
    User.countDocuments(filter),
    User.countDocuments({
      businessId: business._id,
      role: "staff",
      isActive: true,
    }),
  ]);

  return {
    staff,
    usage: {
      activeStaffCount,
      staffLimit: business.plan?.limits?.staffAccounts ?? 0,
    },
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.ceil(total / safeLimit),
    },
  };
};

export const createStaff = async (userId, data) => {
  const business = await getBusinessForOwner(userId);
  await assertCanAddStaff(business);

  const [emailTaken, usernameTaken] = await Promise.all([
    User.findOne({ email: data.email }),
    User.findOne({ username: data.username }),
  ]);

  if (emailTaken) throw new AppError("Email is already registered", 409);
  if (usernameTaken) throw new AppError("Username is already taken", 409);

  const staff = await User.create({
    email: data.email,
    username: data.username,
    password: data.password,
    name: data.name,
    phone: data.phone || "",
    businessId: business._id,
    role: "staff",
    isEmailVerified: data.isEmailVerified ?? true,
    consentToDataProcessing: true,
  });

  await Business.updateOne(
    { _id: business._id },
    {
      $addToSet: { staffIds: staff._id },
    },
  );
  await updateActiveStaffUsage(business._id);

  return User.findById(staff._id).select(publicStaffFields);
};

export const getStaff = async (userId, staffId) => {
  const business = await getBusinessForOwner(userId);
  return getStaffForBusiness(business._id, staffId);
};

export const updateStaff = async (userId, staffId, data) => {
  const business = await getBusinessForOwner(userId);
  const staff = await getStaffForBusiness(business._id, staffId);

  const allowed = ["name", "phone", "profilePicture"];
  for (const field of allowed) {
    if (data[field] !== undefined) staff[field] = data[field];
  }

  if (data.email !== undefined && data.email !== staff.email) {
    const exists = await User.findOne({ email: data.email, _id: { $ne: staff._id } });
    if (exists) throw new AppError("Email is already registered", 409);
    staff.email = data.email;
  }

  if (data.username !== undefined && data.username !== staff.username) {
    const exists = await User.findOne({
      username: data.username,
      _id: { $ne: staff._id },
    });
    if (exists) throw new AppError("Username is already taken", 409);
    staff.username = data.username;
  }

  await staff.save();
  return User.findById(staff._id).select(publicStaffFields);
};

export const setStaffStatus = async (userId, staffId, isActive) => {
  const business = await getBusinessForOwner(userId);
  const staff = await getStaffForBusiness(business._id, staffId);

  if (Boolean(staff.isActive) === Boolean(isActive)) {
    throw new AppError(
      `Staff member is already ${isActive ? "active" : "inactive"}.`,
      409,
    );
  }

  if (isActive) {
    await assertCanAddStaff(business);
  }

  staff.isActive = Boolean(isActive);
  staff.refreshTokens = [];
  staff.tokenVersion = (staff.tokenVersion || 1) + 1;
  await staff.save();
  await updateActiveStaffUsage(business._id);

  return User.findById(staff._id).select(publicStaffFields);
};

export const deleteStaff = async (userId, staffId) => {
  const business = await getBusinessForOwner(userId);
  const staff = await getStaffForBusiness(business._id, staffId);

  staff.isActive = false;
  staff.refreshTokens = [];
  staff.tokenVersion = (staff.tokenVersion || 1) + 1;
  await staff.save();

  await Business.updateOne(
    { _id: business._id },
    {
      $pull: { staffIds: staff._id },
    },
  );
  await updateActiveStaffUsage(business._id);

  return { deleted: true };
};

export const resetStaffPassword = async (userId, staffId, newPassword) => {
  const business = await getBusinessForOwner(userId);
  const staff = await User.findOne({
    _id: staffId,
    businessId: business._id,
    role: "staff",
  }).select("+refreshTokens +tokenVersion +passwordHistory");

  if (!staff) throw new AppError("Staff member not found", 404);

  staff.password = newPassword;
  staff.refreshTokens = [];
  staff.tokenVersion = (staff.tokenVersion || 1) + 1;
  await staff.save();

  return User.findById(staff._id).select(publicStaffFields);
};
