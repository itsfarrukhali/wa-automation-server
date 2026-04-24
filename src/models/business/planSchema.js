import mongoose from "mongoose";

const planLimitsSchema = new mongoose.Schema(
  {
    monthlyMessages: {
      type: Number,
      required: true,
    },
    staffAccounts: {
      type: Number,
      required: true,
    },
    customers: {
      type: Number,
      required: true,
    },
    templates: {
      type: Number,
      default: 3,
    },
    campaigns: {
      type: Number,
      default: 1,
    },
    automationRules: {
      type: Number,
      default: 2,
    },
    reportsHistory: {
      type: Number,
      default: 30,
    },
  },
  { _id: false },
);

const planUsageSchema = new mongoose.Schema(
  {
    messagesThisMonth: {
      type: Number,
      default: 0,
    },
    messagesResetAt: {
      type: Date,
      default: Date.now,
    },
    activeStaffCount: {
      type: Number,
      default: 0,
    },
    customerCount: {
      type: Number,
      default: 0,
    },
  },
  { _id: false },
);

const planSchema = new mongoose.Schema(
  {
    currentPlan: {
      type: String,
      enum: ["free", "starter", "growth", "enterprise"],
      default: "free",
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    isTrial: { type: Boolean, default: true },
    trialEndsAt: {
      type: Date,
      default: () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
    // Payment tracking
    paymentMethod: {
      type: String,
      enum: [
        "jazzcash",
        "easypaisa",
        "card",
        "bank_transfer",
        "manual",
        "none",
      ],
      default: "none",
    },
    paymentStatus: {
      type: String,
      enum: ["active", "past_due", "cancelled", "never_paid"],
      default: "never_paid",
    },
    lastPaymentAt: Date,
    nextBillingAt: Date,
    amount: Number,
    currency: { type: String, default: "PKR" },

    limits: planLimitsSchema,
    usage: planUsageSchema,
  },
  { _id: false },
);

// Methods for plan management
planSchema.methods.canSendMessage = function () {
  return this.usage.messagesThisMonth < this.limits.monthlyMessages;
};

planSchema.methods.resetMonthlyUsage = function () {
  if (!this.usage) {
    this.usage = {};
  }
  const now = new Date();
  const resetDate = new Date(this.usage.messagesResetAt);

  if (
    now.getMonth() !== resetDate.getMonth() ||
    now.getFullYear() !== resetDate.getFullYear()
  ) {
    this.usage.messagesThisMonth = 0;
    this.usage.messagesResetAt = now;
  }
};

planSchema.methods.upgradeTo = function (newPlan) {
  const plans = {
    free: {
      monthlyMessages: 500,
      staffAccounts: 1,
      customers: 100,
    },
    starter: {
      monthlyMessages: 2000,
      staffAccounts: 3,
      customers: 500,
    },
    growth: {
      monthlyMessages: 10000,
      staffAccounts: 10,
      customers: 2000,
    },
    enterprise: {
      monthlyMessages: 50000,
      staffAccounts: -1,
      customers: -1,
    },
  };

  this.currentPlan = newPlan;
  this.limits = plans[newPlan];
  this.startedAt = new Date();
  this.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  this.paymentStatus = "active";
  this.isTrial = false;
};

export default planSchema;
