/**
 * services/business.service.js
 *
 * All business logic for the Business resource.
 * Pattern mirrors auth.service.js — pure functions, no req/res, throws AppError.
 *
 * Onboarding is the core real-world flow:
 *   Step 1 → Basic Info  (name, type, phone, email)
 *   Step 2 → Location    (city, area, address, coordinates)
 *   Step 3 → Working Hours
 *   Step 4 → Engagement Settings (reminders, win-back, reviews)
 *   Step 5 → WhatsApp    (phoneNumberId, wabaId — marks onboarding complete)
 *
 * Each step is an independent PATCH so the frontend can save progress
 * without requiring the user to fill everything in one session.
 */

import Business from "../models/business/business.model.js";
import User from "../models/user.model.js";
import { AppError } from "../utils/helpers/errorHandler.utils.js";

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Load the business that belongs to the authenticated user.
 * Throws 404 if not found — used by almost every service function.
 *
 * @param {string} userId
 * @param {string} [selectFields] - Additional fields to select (e.g. "+whatsapp.accessToken")
 */
const getOwnedBusiness = async (userId, selectFields = "") => {
  const query = Business.findOne({ ownerId: userId, isActive: true });
  if (selectFields) query.select(selectFields);

  const business = await query;
  if (!business) {
    throw new AppError(
      "Business not found. Complete your registration to continue.",
      404,
    );
  }
  return business;
};

/**
 * Validate that onboarding steps are completed in order.
 * Prevents a user from jumping to step 4 without completing step 3.
 *
 * @param {number} currentStep - business.onboardingStep (last completed step)
 * @param {number} targetStep  - step the user is trying to save
 */
const assertStepOrder = (currentStep, targetStep) => {
  if (targetStep > currentStep + 1) {
    throw new AppError(
      `Please complete step ${currentStep + 1} before proceeding to step ${targetStep}.`,
      422,
    );
  }
};

/**
 * Advance onboardingStep only when the user completes the NEXT step.
 * Re-saving a completed step should not regress the pointer.
 *
 * @param {object} business - Mongoose document
 * @param {number} completedStep - step number just saved
 */
const advanceOnboardingStep = (business, completedStep) => {
  if (completedStep >= business.onboardingStep) {
    business.onboardingStep = completedStep;
  }
};

// ─── Read ─────────────────────────────────────────────────────────────────────

export const getMyBusiness = async (userId) => {
  return getOwnedBusiness(userId);
};

export const getOnboardingStatus = async (userId) => {
  const business = await getOwnedBusiness(userId);

  const stepLabels = {
    1: "Basic Info",
    2: "Location",
    3: "Working Hours",
    4: "Engagement Settings",
    5: "WhatsApp Connection",
  };

  const steps = [1, 2, 3, 4, 5].map((n) => ({
    step: n,
    label: stepLabels[n],
    completed: n < business.onboardingStep,
    current: n === business.onboardingStep,
  }));

  return {
    onboardingComplete: business.onboardingComplete,
    currentStep: business.onboardingStep,
    steps,
    businessId: business._id,
    businessName: business.name,
    businessType: business.type,
  };
};

// ─── Onboarding Steps ─────────────────────────────────────────────────────────

export const completeStep1BasicInfo = async (userId, data) => {
  const business = await getOwnedBusiness(userId);
  assertStepOrder(business.onboardingStep, 1);

  const { name, type, phone, landline, email } = data;

  if (name !== undefined) business.name = name;
  if (type !== undefined) business.type = type;
  if (phone !== undefined) business.phone = phone;
  if (landline !== undefined) business.landline = landline;
  if (email !== undefined) business.email = email;

  advanceOnboardingStep(business, 1);
  await business.save();
  return business;
};

export const completeStep2Location = async (userId, data) => {
  const business = await getOwnedBusiness(userId);
  assertStepOrder(business.onboardingStep, 2);

  const { city, area, address, location } = data;

  if (city !== undefined) business.city = city;
  if (area !== undefined) business.area = area;
  if (address !== undefined) business.address = address;

  // Convert flat lat/lng to GeoJSON format expected by locationSchema
  if (location?.lat !== undefined && location?.lng !== undefined) {
    business.location = {
      type: "Point",
      coordinates: [location.lng, location.lat], // [longitude, latitude]
    };
  }

  advanceOnboardingStep(business, 2);
  await business.save();
  return business;
};

export const completeStep3WorkingHours = async (userId, data) => {
  const business = await getOwnedBusiness(userId);
  assertStepOrder(business.onboardingStep, 3);

  const { workingHours, timezone } = data;

  if (!Array.isArray(workingHours) || workingHours.length === 0) {
    throw new AppError("Working hours array is required.", 422);
  }

  const VALID_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

  for (const entry of workingHours) {
    if (!VALID_DAYS.includes(entry.day)) {
      throw new AppError(
        `Invalid day "${entry.day}". Must be one of: ${VALID_DAYS.join(", ")}`,
        422,
      );
    }
    if (entry.isOpen && (!entry.openTime || !entry.closeTime)) {
      throw new AppError(
        `openTime and closeTime are required when isOpen is true (day: ${entry.day})`,
        422,
      );
    }
  }

  // Ensure all 7 days are present — fill missing days with closed defaults
  const provided = new Map(workingHours.map((e) => [e.day, e]));
  business.workingHours = VALID_DAYS.map((day) =>
    provided.has(day)
      ? provided.get(day)
      : { day, isOpen: false, openTime: "09:00", closeTime: "18:00" },
  );

  if (timezone) business.timezone = timezone;

  advanceOnboardingStep(business, 3);
  await business.save();
  return business;
};

export const completeStep4Engagement = async (userId, data) => {
  const business = await getOwnedBusiness(userId);
  assertStepOrder(business.onboardingStep, 4);

  const {
    reminderTime,
    followUpDays,
    winbackDays,
    reviewRequestEnabled,
    reviewPlatform,
  } = data;

  if (reminderTime !== undefined)
    business.engagement.reminderTime = reminderTime;
  if (followUpDays !== undefined)
    business.engagement.followUpDays = followUpDays;
  if (winbackDays !== undefined) business.engagement.winbackDays = winbackDays;
  if (reviewRequestEnabled !== undefined)
    business.engagement.reviewRequestEnabled = reviewRequestEnabled;
  if (reviewPlatform !== undefined)
    business.engagement.reviewPlatform = reviewPlatform;

  business.markModified("engagement");
  advanceOnboardingStep(business, 4);
  await business.save();
  return business;
};

export const completeStep5WhatsApp = async (userId, data) => {
  const business = await getOwnedBusiness(userId);
  assertStepOrder(business.onboardingStep, 5);

  const {
    phoneNumberId,
    wabaId,
    displayPhoneNumber,
    verifiedName,
    accessToken,
  } = data;

  if (!phoneNumberId) {
    throw new AppError("phoneNumberId is required to connect WhatsApp.", 422);
  }

  business.whatsapp.phoneNumberId = phoneNumberId;
  if (wabaId) business.whatsapp.wabaId = wabaId;
  if (displayPhoneNumber)
    business.whatsapp.displayPhoneNumber = displayPhoneNumber;
  if (verifiedName) business.whatsapp.verifiedName = verifiedName;

  // Encrypt access token before storage (whatsappSchema.encryptToken returns an object)
  if (accessToken) {
    const encrypted = business.whatsapp.encryptToken(accessToken);
    // Store as a JSON string because the schema expects a String field.
    // TODO: In production, adjust the schema to have separate iv/tag fields for cleaner handling.
    business.whatsapp.accessToken = JSON.stringify(encrypted);
  }

  business.whatsapp.connectionStatus = "connected";
  business.whatsapp.lastConnectedAt = new Date();
  business.whatsappVerified = true;

  business.markModified("whatsapp");

  advanceOnboardingStep(business, 5);
  await business.save();
  return business;
};

// ─── Profile Updates (post-onboarding) ────────────────────────────────────────

export const updateProfile = async (userId, updates) => {
  const business = await getOwnedBusiness(userId);

  const ALLOWED_FIELDS = [
    "name",
    "phone",
    "landline",
    "email",
    "logo",
    "coverImage",
  ];

  for (const field of ALLOWED_FIELDS) {
    if (updates[field] !== undefined) {
      business[field] = updates[field];
    }
  }

  await business.save();
  return business;
};

export const updateSettings = async (userId, data) => {
  const business = await getOwnedBusiness(userId);
  const { notifications, language, currency } = data;

  if (notifications?.email !== undefined) {
    business.settings.notifications.email = notifications.email;
  }
  if (notifications?.whatsapp !== undefined) {
    business.settings.notifications.whatsapp = notifications.whatsapp;
  }
  if (language !== undefined) business.settings.language = language;
  if (currency !== undefined) business.settings.currency = currency;

  business.markModified("settings");
  await business.save();
  return business;
};

export const updateWorkingHoursDay = async (userId, day, data) => {
  const VALID_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

  if (!VALID_DAYS.includes(day)) {
    throw new AppError(
      `Invalid day "${day}". Must be one of: ${VALID_DAYS.join(", ")}`,
      422,
    );
  }

  const business = await getOwnedBusiness(userId);
  const entry = business.workingHours.find((h) => h.day === day);

  if (!entry) {
    throw new AppError(`Working hours entry not found for day: ${day}`, 404);
  }

  const { isOpen, openTime, closeTime } = data;

  if (isOpen !== undefined) entry.isOpen = isOpen;
  if (openTime !== undefined) entry.openTime = openTime;
  if (closeTime !== undefined) entry.closeTime = closeTime;

  if (entry.isOpen && (!entry.openTime || !entry.closeTime)) {
    throw new AppError(
      "openTime and closeTime are required when isOpen is true.",
      422,
    );
  }

  business.markModified("workingHours");
  await business.save();
  return business;
};

export const updateEngagement = async (userId, data) => {
  const business = await getOwnedBusiness(userId);

  const {
    reminderTime,
    followUpDays,
    winbackDays,
    reviewRequestEnabled,
    reviewPlatform,
  } = data;

  if (reminderTime !== undefined)
    business.engagement.reminderTime = reminderTime;
  if (followUpDays !== undefined)
    business.engagement.followUpDays = followUpDays;
  if (winbackDays !== undefined) business.engagement.winbackDays = winbackDays;
  if (reviewRequestEnabled !== undefined)
    business.engagement.reviewRequestEnabled = reviewRequestEnabled;
  if (reviewPlatform !== undefined)
    business.engagement.reviewPlatform = reviewPlatform;

  business.markModified("engagement");
  await business.save();
  return business;
};

// ─── Plan ─────────────────────────────────────────────────────────────────────

export const getPlanDetails = async (userId) => {
  const business = await getOwnedBusiness(userId);
  const { plan } = business;

  const messageUsagePct =
    plan.limits?.monthlyMessages > 0
      ? Math.round(
          (plan.usage.messagesThisMonth / plan.limits.monthlyMessages) * 100,
        )
      : 0;

  const customerUsagePct =
    plan.limits?.customers > 0
      ? Math.round((plan.usage.customerCount / plan.limits.customers) * 100)
      : 0;

  return {
    currentPlan: plan.currentPlan,
    isTrial: plan.isTrial,
    trialEndsAt: plan.trialEndsAt,
    paymentStatus: plan.paymentStatus,
    paymentMethod: plan.paymentMethod,
    nextBillingAt: plan.nextBillingAt,
    expiresAt: plan.expiresAt,
    limits: plan.limits,
    usage: {
      ...(plan.usage.toObject?.() ?? plan.usage),
      messageUsagePct,
      customerUsagePct,
    },
  };
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

// ─── Dashboard ────────────────────────────────────────────────────────────────

export const getDashboardStats = async (userId) => {
  const business = await getOwnedBusiness(userId);

  // Lazy-load to avoid circular dependency issues at module init
  const { default: Booking } = await import("../models/booking.model.js");
  const { default: Customer } = await import("../models/customer.model.js");

  const businessId = business._id;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [
    totalCustomers,
    activeCustomers,
    bookingsToday,
    bookingsPending,
    bookingsCompleted,
  ] = await Promise.all([
    Customer.countDocuments({ businessId, isActive: true }),
    Customer.countDocuments({
      businessId,
      lastVisit: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // ✅ corrected field
    }),
    Booking.countDocuments({
      businessId,
      scheduledAt: { $gte: todayStart, $lte: todayEnd },
    }),
    Booking.countDocuments({ businessId, status: "pending" }),
    Booking.countDocuments({ businessId, status: "completed" }),
  ]);

  return {
    business: {
      id: business._id,
      name: business.name,
      type: business.type,
      isOpenNow: business.isOpenNow(),
      onboardingComplete: business.onboardingComplete,
      whatsappConnected: business.whatsapp?.connectionStatus === "connected",
    },
    plan: {
      current: business.plan.currentPlan,
      isTrial: business.plan.isTrial,
      trialEndsAt: business.plan.trialEndsAt,
      messagesUsed: business.plan.usage?.messagesThisMonth ?? 0,
      messagesLimit: business.plan.limits?.monthlyMessages ?? 0,
    },
    customers: {
      total: totalCustomers,
      active: activeCustomers,
      inactive: totalCustomers - activeCustomers,
    },
    bookings: {
      today: bookingsToday,
      pending: bookingsPending,
      completed: bookingsCompleted,
    },
    messages: {
      total: business.whatsapp?.messages?.total ?? 0,
      thisMonth: business.whatsapp?.messages?.thisMonth ?? 0,
      delivered: business.whatsapp?.messages?.delivered ?? 0,
      failed: business.whatsapp?.messages?.failed ?? 0,
    },
  };
};

// ─── Admin ────────────────────────────────────────────────────────────────────

export const listBusinesses = async ({
  page = 1,
  limit = 20,
  isActive,
  onboardingComplete,
  type,
  city,
} = {}) => {
  const filter = {};

  if (isActive !== undefined)
    filter.isActive = isActive === "true" || isActive === true;
  if (onboardingComplete !== undefined)
    filter.onboardingComplete =
      onboardingComplete === "true" || onboardingComplete === true;
  if (type) filter.type = type;
  if (city) filter.city = city;

  const skip = (Number(page) - 1) * Number(limit);

  const [businesses, total] = await Promise.all([
    Business.find(filter)
      .select(
        "name type city onboardingStep onboardingComplete isActive plan.currentPlan createdAt",
      )
      .skip(skip)
      .limit(Number(limit))
      .sort({ createdAt: -1 }),
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
