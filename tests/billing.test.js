import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import Business from "../src/models/business/business.model.js";
import Category from "../src/models/common/categorySchema.js";
import User from "../src/models/user.model.js";
import * as BillingService from "../src/services/billing.service.js";

let mongod;
let ownsMongoConnection = false;

const seedContext = async () => {
  const owner = await User.create({
    email: "billing-owner@test.com",
    username: "billingowner",
    password: "Password123!",
    name: "Billing Owner",
    isEmailVerified: true,
    consentToDataProcessing: true,
    role: "owner",
  });

  const business = await Business.create({
    name: "Billing Salon",
    type: "salon",
    ownerId: owner._id,
    onboardingStep: 5,
    onboardingComplete: true,
    plan: {
      currentPlan: "free",
      limits: {
        monthlyMessages: 500,
        staffAccounts: 1,
        customers: 100,
        templates: 3,
        campaigns: 1,
        automationRules: 2,
        reportsHistory: 30,
      },
      usage: {
        messagesThisMonth: 25,
        activeStaffCount: 0,
        customerCount: 10,
      },
    },
  });

  owner.businessId = business._id;
  await owner.save();
  return { owner, business };
};

before(async () => {
  if (mongoose.connection.readyState !== 1) {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    ownsMongoConnection = true;
  }

  await Category.findOneAndUpdate(
    { name: "salon" },
    { $set: { name: "salon", isActive: true } },
    { upsert: true, returnDocument: "after" },
  );
});

after(async () => {
  if (ownsMongoConnection) {
    await mongoose.disconnect();
    await mongod.stop();
  }
});

beforeEach(async () => {
  await Promise.all([Business.deleteMany({}), User.deleteMany({})]);
  await Category.findOneAndUpdate(
    { name: "salon" },
    { $set: { name: "salon", isActive: true } },
    { upsert: true, returnDocument: "after" },
  );
});

describe("BillingService", () => {
  it("lists plan catalog", async () => {
    const result = await BillingService.listPlans();

    assert.ok(result.plans.some((plan) => plan.id === "starter"));
    assert.ok(result.plans.some((plan) => plan.id === "growth"));
  });

  it("returns current subscription and usage percentages", async () => {
    const { owner } = await seedContext();

    const result = await BillingService.getSubscription(owner._id.toString());

    assert.equal(result.currentPlan, "free");
    assert.equal(result.usage.messagesThisMonth, 25);
    assert.equal(result.usage.percentages.customers, 10);
  });

  it("creates MVP checkout intent for a paid plan", async () => {
    const { owner } = await seedContext();

    const result = await BillingService.createCheckoutIntent(owner._id.toString(), {
      plan: "starter",
      paymentMethod: "jazzcash",
    });

    assert.equal(result.plan, "starter");
    assert.equal(result.status, "pending");
    assert.ok(result.checkoutId.startsWith("chk_"));
  });

  it("confirms manual payment and upgrades plan with full limits", async () => {
    const { owner, business } = await seedContext();

    const result = await BillingService.confirmManualPayment(owner._id.toString(), {
      plan: "growth",
      paymentMethod: "manual",
      amount: 8000,
      reference: "MANUAL-001",
    });

    assert.equal(result.currentPlan, "growth");
    assert.equal(result.paymentStatus, "active");
    assert.equal(result.limits.templates, 10);
    assert.equal(result.limits.campaigns, 5);

    const updatedBusiness = await Business.findById(business._id);
    assert.equal(updatedBusiness.plan.currentPlan, "growth");
  });

  it("cancels subscription", async () => {
    const { owner } = await seedContext();

    await BillingService.confirmManualPayment(owner._id.toString(), {
      plan: "starter",
      paymentMethod: "manual",
      amount: 3000,
    });

    const result = await BillingService.cancelSubscription(owner._id.toString());

    assert.equal(result.paymentStatus, "cancelled");
  });
});
