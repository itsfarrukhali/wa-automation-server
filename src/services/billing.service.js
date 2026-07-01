import crypto from "crypto";
import { getMyBusiness, upgradePlan } from "./business.service.js";
import { AppError } from "../utils/helpers/errorHandler.utils.js";

export const PLAN_CATALOG = {
  free: {
    name: "Free",
    monthlyPrice: 0,
    currency: "PKR",
    limits: {
      monthlyMessages: 500,
      staffAccounts: 1,
      customers: 100,
      templates: 3,
      campaigns: 1,
      automationRules: 2,
      reportsHistory: 30,
    },
  },
  starter: {
    name: "Starter",
    monthlyPrice: 3000,
    currency: "PKR",
    limits: {
      monthlyMessages: 2000,
      staffAccounts: 3,
      customers: 500,
      templates: 3,
      campaigns: 1,
      automationRules: 2,
      reportsHistory: 30,
    },
  },
  growth: {
    name: "Growth",
    monthlyPrice: 8000,
    currency: "PKR",
    limits: {
      monthlyMessages: 10000,
      staffAccounts: 10,
      customers: 2000,
      templates: 10,
      campaigns: 5,
      automationRules: 10,
      reportsHistory: 180,
    },
  },
  enterprise: {
    name: "Enterprise",
    monthlyPrice: null,
    currency: "PKR",
    limits: {
      monthlyMessages: 50000,
      staffAccounts: -1,
      customers: -1,
      templates: -1,
      campaigns: -1,
      automationRules: -1,
      reportsHistory: 365,
    },
  },
};

const VALID_PLANS = Object.keys(PLAN_CATALOG);
const VALID_PAYMENT_METHODS = ["jazzcash", "easypaisa", "card", "bank_transfer", "manual"];

const usagePct = (used = 0, limit = 0) => {
  if (limit === -1) return 0;
  if (!limit) return 100;
  return Math.min(Math.round((used / limit) * 100), 100);
};

const serializeSubscription = (business) => {
  const plan = business.plan || {};
  const limits = plan.limits || {};
  const usage = plan.usage || {};

  return {
    currentPlan: plan.currentPlan,
    isTrial: plan.isTrial,
    trialEndsAt: plan.trialEndsAt,
    startedAt: plan.startedAt,
    expiresAt: plan.expiresAt,
    paymentStatus: plan.paymentStatus,
    paymentMethod: plan.paymentMethod,
    lastPaymentAt: plan.lastPaymentAt,
    nextBillingAt: plan.nextBillingAt,
    amount: plan.amount,
    currency: plan.currency || "PKR",
    limits,
    usage: {
      messagesThisMonth: usage.messagesThisMonth || 0,
      activeStaffCount: usage.activeStaffCount || 0,
      customerCount: usage.customerCount || 0,
      messagesResetAt: usage.messagesResetAt,
      percentages: {
        messages: usagePct(usage.messagesThisMonth || 0, limits.monthlyMessages),
        staff: usagePct(usage.activeStaffCount || 0, limits.staffAccounts),
        customers: usagePct(usage.customerCount || 0, limits.customers),
      },
    },
  };
};

export const listPlans = async () => ({
  plans: Object.entries(PLAN_CATALOG).map(([id, plan]) => ({
    id,
    ...plan,
  })),
});

export const getSubscription = async (userId) => {
  const business = await getMyBusiness(userId);
  return serializeSubscription(business);
};

export const createCheckoutIntent = async (userId, { plan, paymentMethod }) => {
  const business = await getMyBusiness(userId);

  if (!VALID_PLANS.includes(plan)) {
    throw new AppError(`Invalid plan "${plan}".`, 422);
  }
  if (plan === "free") {
    throw new AppError("Free plan does not require checkout.", 422);
  }
  if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
    throw new AppError("Invalid payment method.", 422);
  }

  const catalogPlan = PLAN_CATALOG[plan];
  const checkoutId = `chk_${crypto.randomBytes(12).toString("hex")}`;

  return {
    checkoutId,
    mode: "manual_mvp",
    businessId: business._id,
    plan,
    amount: catalogPlan.monthlyPrice,
    currency: catalogPlan.currency,
    paymentMethod,
    status: "pending",
    instructions:
      "MVP checkout intent created. Confirm payment through the manual payment endpoint after collecting payment.",
  };
};

export const confirmManualPayment = async (
  userId,
  { plan, paymentMethod = "manual", reference, amount },
) => {
  const business = await getMyBusiness(userId);

  if (!VALID_PLANS.includes(plan) || plan === "free") {
    throw new AppError("A paid plan is required.", 422);
  }
  if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
    throw new AppError("Invalid payment method.", 422);
  }

  const catalogPlan = PLAN_CATALOG[plan];
  const paidAmount = Number(amount ?? catalogPlan.monthlyPrice);
  if (catalogPlan.monthlyPrice && paidAmount < catalogPlan.monthlyPrice) {
    throw new AppError("Paid amount is less than the selected plan price.", 422);
  }

  const updated = await upgradePlan(business._id, plan, paymentMethod);
  updated.plan.amount = paidAmount;
  updated.plan.currency = catalogPlan.currency;
  updated.plan.nextBillingAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  updated.plan.paymentStatus = "active";
  updated.plan.lastPaymentAt = new Date();
  updated.plan.paymentMethod = paymentMethod;
  updated.plan.manualReference = reference;
  updated.markModified("plan");
  await updated.save();

  return serializeSubscription(updated);
};

export const cancelSubscription = async (userId) => {
  const business = await getMyBusiness(userId);
  business.plan.paymentStatus = "cancelled";
  business.plan.expiresAt = business.plan.expiresAt || new Date();
  business.markModified("plan");
  await business.save();
  return serializeSubscription(business);
};

export const downgradeToFree = async (userId) => {
  const business = await getMyBusiness(userId);
  const updated = await upgradePlan(business._id, "free", "none");
  updated.plan.paymentStatus = "never_paid";
  updated.plan.isTrial = false;
  updated.markModified("plan");
  await updated.save();
  return serializeSubscription(updated);
};
