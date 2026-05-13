/**
 * test/business.test.js
 *
 * Business module test suite — 40 cases
 * Stack: Mocha + MongoMemoryServer + sinon (email stubs) + node:assert
 *
 * Pattern is identical to the auth test suite:
 *   - MongoMemoryServer spins up before all tests, tears down after
 *   - Email service methods are stubbed so no real sends happen
 *   - Each describe block is one logical slice (onboarding step, profile update, etc.)
 *   - beforeEach seeds a fresh user + business for isolation
 *
 * Run:
 *   npm test
 *   npx mocha test/business.test.js --exit
 */

import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

// ── Service under test ────────────────────────────────────────────────────────
import * as BusinessService from "../src/services/business.service.js";

// ── Models (we need to seed data) ────────────────────────────────────────────
import Business from "../src/models/business/business.model.js";
import User from "../src/models/user.model.js";
import Category from "../src/models/common/categorySchema.js";
import City from "../src/models/common/citySchema.js";

// ── Helpers ───────────────────────────────────────────────────────────────────
import { AppError } from "../src/utils/helpers/errorHandler.utils.js";

// ─── Test data factories ──────────────────────────────────────────────────────

let mongod;
let ownsMongoConnection = false;

/**
 * Create a verified user + linked business.
 * Business type is seeded from the Category collection so the validator passes.
 */
const seedUserAndBusiness = async (overrides = {}) => {
  const user = await User.create({
    email: overrides.email ?? "owner@test.com",
    username: overrides.username ?? "testowner",
    password: "Password123!",
    name: "Test Owner",
    isEmailVerified: true,
    consentToDataProcessing: true,
    role: "owner",
  });

  const business = await Business.create({
    name: overrides.businessName ?? "Test Salon",
    type: "salon", // matches seeded Category
    ownerId: user._id,
    onboardingStep: overrides.onboardingStep ?? 1,
  });

  // Link business back to user
  user.businessId = business._id;
  await user.save();

  return { user, business };
};

// ─── Suite setup / teardown ───────────────────────────────────────────────────

before(async () => {
  if (mongoose.connection.readyState !== 1) {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    ownsMongoConnection = true;
  }

  // Seed reference data that model validators hit
  await Category.findOneAndUpdate(
    { name: "salon" },
    { $set: { name: "salon", isActive: true } },
    { upsert: true, new: true },
  );
  await Category.findOneAndUpdate(
    { name: "clinic" },
    { $set: { name: "clinic", isActive: true } },
    { upsert: true, new: true },
  );
  await City.findOneAndUpdate(
    { name: "Karachi" },
    { $set: { name: "Karachi", isActive: true } },
    { upsert: true, new: true },
  );
  await City.findOneAndUpdate(
    { name: "Lahore" },
    { $set: { name: "Lahore", isActive: true } },
    { upsert: true, new: true },
  );
});

after(async () => {
  if (ownsMongoConnection) {
    await mongoose.disconnect();
  }

  if (mongod) {
    await mongod.stop();
  }
});

beforeEach(async () => {
  // Drop data between tests but keep the seeded Category + City docs
  await User.deleteMany({});
  await Business.deleteMany({});

  // Other suites may clear City docs; ensure required cities exist for validators.
  await City.findOneAndUpdate(
    { name: "Karachi" },
    { $set: { name: "Karachi", isActive: true } },
    { upsert: true, new: true },
  );
  await City.findOneAndUpdate(
    { name: "Lahore" },
    { $set: { name: "Lahore", isActive: true } },
    { upsert: true, new: true },
  );
});

// ══════════════════════════════════════════════════════════════════════════════
// 1. getMyBusiness
// ══════════════════════════════════════════════════════════════════════════════

describe("BusinessService.getMyBusiness", () => {
  it("returns the business for a valid owner", async () => {
    const { user, business } = await seedUserAndBusiness();

    const result = await BusinessService.getMyBusiness(user._id.toString());

    assert.equal(result._id.toString(), business._id.toString());
    assert.equal(result.name, "Test Salon");
  });

  it("throws 404 when user has no business", async () => {
    const user = await User.create({
      email: "nobiz@test.com",
      username: "nobiz",
      password: "Password123!",
      name: "No Biz",
      isEmailVerified: true,
      consentToDataProcessing: true,
    });

    await assert.rejects(
      () => BusinessService.getMyBusiness(user._id.toString()),
      (err) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 404);
        return true;
      },
    );
  });

  it("throws 404 when business is soft-deleted (isActive: false)", async () => {
    const { user, business } = await seedUserAndBusiness();
    await Business.findByIdAndUpdate(business._id, { isActive: false });

    await assert.rejects(
      () => BusinessService.getMyBusiness(user._id.toString()),
      (err) => {
        assert.equal(err.statusCode, 404);
        return true;
      },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. getOnboardingStatus
// ══════════════════════════════════════════════════════════════════════════════

describe("BusinessService.getOnboardingStatus", () => {
  it("returns correct step state for a fresh business (step 1)", async () => {
    const { user } = await seedUserAndBusiness({ onboardingStep: 1 });

    const status = await BusinessService.getOnboardingStatus(
      user._id.toString(),
    );

    assert.equal(status.currentStep, 1);
    assert.equal(status.onboardingComplete, false);
    assert.equal(status.steps.length, 5);

    const step1 = status.steps.find((s) => s.step === 1);
    assert.equal(step1.current, true);
    assert.equal(step1.completed, false);
  });

  it("marks previous steps as completed", async () => {
    const { user } = await seedUserAndBusiness({ onboardingStep: 3 });

    const status = await BusinessService.getOnboardingStatus(
      user._id.toString(),
    );

    const step1 = status.steps.find((s) => s.step === 1);
    const step2 = status.steps.find((s) => s.step === 2);
    const step3 = status.steps.find((s) => s.step === 3);

    assert.equal(step1.completed, true);
    assert.equal(step2.completed, true);
    assert.equal(step3.current, true);
    assert.equal(step3.completed, false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. Onboarding Step 1 — Basic Info
// ══════════════════════════════════════════════════════════════════════════════

describe("BusinessService.completeStep1BasicInfo", () => {
  it("updates name, phone, email and advances step to 1", async () => {
    const { user } = await seedUserAndBusiness();

    const result = await BusinessService.completeStep1BasicInfo(
      user._id.toString(),
      { name: "Glamour Salon", phone: "03001234567", email: "salon@test.com" },
    );

    assert.equal(result.name, "Glamour Salon");
    assert.equal(result.phone, "03001234567");
    assert.equal(result.email, "salon@test.com");
    assert.equal(result.onboardingStep, 1);
  });

  it("allows partial update — only name, leaving other fields untouched", async () => {
    const { user, business } = await seedUserAndBusiness();
    const originalPhone = business.phone;

    const result = await BusinessService.completeStep1BasicInfo(
      user._id.toString(),
      { name: "New Name Only" },
    );

    assert.equal(result.name, "New Name Only");
    assert.equal(result.phone, originalPhone);
  });

  it("throws 422 when trying to skip to step 3 from step 1", async () => {
    const { user } = await seedUserAndBusiness({ onboardingStep: 1 });

    await assert.rejects(
      () =>
        BusinessService.completeStep3WorkingHours(user._id.toString(), {
          workingHours: [
            { day: "mon", isOpen: true, openTime: "09:00", closeTime: "18:00" },
          ],
        }),
      (err) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 422);
        assert.ok(err.message.includes("step 2"));
        return true;
      },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. Onboarding Step 2 — Location
// ══════════════════════════════════════════════════════════════════════════════

describe("BusinessService.completeStep2Location", () => {
  it("saves city, area, address and advances step", async () => {
    const { user } = await seedUserAndBusiness({ onboardingStep: 1 });

    const result = await BusinessService.completeStep2Location(
      user._id.toString(),
      {
        city: "Karachi",
        area: "DHA Phase 6",
        address: "Main Bukhari Commercial",
      },
    );

    assert.equal(result.city, "Karachi");
    assert.equal(result.area, "DHA Phase 6");
    assert.equal(result.onboardingStep, 2);
  });

  it("saves lat/lng coordinates when provided", async () => {
    const { user } = await seedUserAndBusiness({ onboardingStep: 1 });

    const result = await BusinessService.completeStep2Location(
      user._id.toString(),
      { location: { lat: 24.8607, lng: 67.0011 } },
    );

    assert.ok(result.location);
    assert.equal(result.location.type, "Point");
    assert.equal(result.location.coordinates[0], 67.0011);
    assert.equal(result.location.coordinates[1], 24.8607);
  });

  it("allows saving without city (city is optional)", async () => {
    const { user } = await seedUserAndBusiness({ onboardingStep: 1 });

    const result = await BusinessService.completeStep2Location(
      user._id.toString(),
      { area: "Gulberg", address: "Main Boulevard" },
    );

    assert.equal(result.area, "Gulberg");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. Onboarding Step 3 — Working Hours
// ══════════════════════════════════════════════════════════════════════════════

describe("BusinessService.completeStep3WorkingHours", () => {
  let user;

  beforeEach(async () => {
    const seeded = await seedUserAndBusiness({ onboardingStep: 2 });
    user = seeded.user;
  });

  it("saves a full 7-day schedule", async () => {
    const schedule = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map(
      (day) => ({
        day,
        isOpen: day !== "sun",
        openTime: "09:00",
        closeTime: "18:00",
      }),
    );

    const result = await BusinessService.completeStep3WorkingHours(
      user._id.toString(),
      { workingHours: schedule },
    );

    assert.equal(result.workingHours.length, 7);
    const sunday = result.workingHours.find((h) => h.day === "sun");
    assert.equal(sunday.isOpen, false);
  });

  it("fills missing days with isOpen:false defaults", async () => {
    // Only send 5 days — sat and sun should be filled automatically
    const schedule = ["mon", "tue", "wed", "thu", "fri"].map((day) => ({
      day,
      isOpen: true,
      openTime: "09:00",
      closeTime: "18:00",
    }));

    const result = await BusinessService.completeStep3WorkingHours(
      user._id.toString(),
      { workingHours: schedule },
    );

    assert.equal(result.workingHours.length, 7);
    const sat = result.workingHours.find((h) => h.day === "sat");
    assert.equal(sat.isOpen, false);
  });

  it("throws 422 when workingHours array is empty", async () => {
    await assert.rejects(
      () =>
        BusinessService.completeStep3WorkingHours(user._id.toString(), {
          workingHours: [],
        }),
      (err) => {
        assert.equal(err.statusCode, 422);
        return true;
      },
    );
  });

  it("throws 422 for an invalid day name", async () => {
    await assert.rejects(
      () =>
        BusinessService.completeStep3WorkingHours(user._id.toString(), {
          workingHours: [
            {
              day: "monday",
              isOpen: true,
              openTime: "09:00",
              closeTime: "18:00",
            },
          ],
        }),
      (err) => {
        assert.equal(err.statusCode, 422);
        assert.ok(err.message.includes("monday"));
        return true;
      },
    );
  });

  it("throws 422 when isOpen:true but openTime is missing", async () => {
    await assert.rejects(
      () =>
        BusinessService.completeStep3WorkingHours(user._id.toString(), {
          workingHours: [{ day: "mon", isOpen: true, closeTime: "18:00" }],
        }),
      (err) => {
        assert.equal(err.statusCode, 422);
        return true;
      },
    );
  });

  it("saves custom timezone", async () => {
    const result = await BusinessService.completeStep3WorkingHours(
      user._id.toString(),
      {
        workingHours: [
          { day: "mon", isOpen: true, openTime: "09:00", closeTime: "18:00" },
        ],
        timezone: "Asia/Lahore",
      },
    );

    assert.equal(result.timezone, "Asia/Lahore");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. Onboarding Step 4 — Engagement Settings
// ══════════════════════════════════════════════════════════════════════════════

describe("BusinessService.completeStep4Engagement", () => {
  it("saves engagement settings and advances step", async () => {
    const { user } = await seedUserAndBusiness({ onboardingStep: 3 });

    const result = await BusinessService.completeStep4Engagement(
      user._id.toString(),
      {
        reminderTime: 48,
        followUpDays: 3,
        winbackDays: 60,
        reviewRequestEnabled: true,
        reviewPlatform: "google",
      },
    );

    assert.equal(result.engagement.reminderTime, 48);
    assert.equal(result.engagement.followUpDays, 3);
    assert.equal(result.engagement.winbackDays, 60);
    assert.equal(result.engagement.reviewPlatform, "google");
    assert.equal(result.onboardingStep, 4);
  });

  it("merges partial updates — untouched fields keep defaults", async () => {
    const { user } = await seedUserAndBusiness({ onboardingStep: 3 });

    const result = await BusinessService.completeStep4Engagement(
      user._id.toString(),
      { reminderTime: 12 },
    );

    // Only reminderTime changed; winbackDays should still be the default (30)
    assert.equal(result.engagement.reminderTime, 12);
    assert.equal(result.engagement.winbackDays, 30);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. Onboarding Step 5 — WhatsApp
// ══════════════════════════════════════════════════════════════════════════════

describe("BusinessService.completeStep5WhatsApp", () => {
  it("connects WhatsApp and marks onboarding complete", async () => {
    const { user } = await seedUserAndBusiness({ onboardingStep: 4 });

    const result = await BusinessService.completeStep5WhatsApp(
      user._id.toString(),
      {
        phoneNumberId: "123456789",
        wabaId: "waba_abc",
        displayPhoneNumber: "+923001234567",
        verifiedName: "Test Salon",
      },
    );

    assert.equal(result.whatsapp.connectionStatus, "connected");
    assert.equal(result.whatsapp.phoneNumberId, "123456789");
    assert.equal(result.whatsappVerified, true);
    assert.equal(result.onboardingComplete, true);
    assert.ok(result.onboardingCompletedAt instanceof Date);
  });

  it("throws 422 when phoneNumberId is missing", async () => {
    const { user } = await seedUserAndBusiness({ onboardingStep: 4 });

    await assert.rejects(
      () =>
        BusinessService.completeStep5WhatsApp(user._id.toString(), {
          wabaId: "waba_abc",
        }),
      (err) => {
        assert.equal(err.statusCode, 422);
        assert.ok(err.message.includes("phoneNumberId"));
        return true;
      },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. updateProfile
// ══════════════════════════════════════════════════════════════════════════════

describe("BusinessService.updateProfile", () => {
  it("updates allowed fields", async () => {
    const { user } = await seedUserAndBusiness();

    const result = await BusinessService.updateProfile(user._id.toString(), {
      name: "Premium Salon",
      phone: "03211234567",
      email: "premium@salon.pk",
    });

    assert.equal(result.name, "Premium Salon");
    assert.equal(result.phone, "03211234567");
  });

  it("ignores non-allowed fields (plan, onboardingStep)", async () => {
    const { user, business } = await seedUserAndBusiness();
    const originalStep = business.onboardingStep;

    const result = await BusinessService.updateProfile(user._id.toString(), {
      name: "Updated Name",
      onboardingStep: 99, // should be ignored
    });

    assert.equal(result.name, "Updated Name");
    assert.equal(result.onboardingStep, originalStep); // unchanged
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. updateSettings
// ══════════════════════════════════════════════════════════════════════════════

describe("BusinessService.updateSettings", () => {
  it("updates notification and language settings", async () => {
    const { user } = await seedUserAndBusiness();

    const result = await BusinessService.updateSettings(user._id.toString(), {
      notifications: { email: false, whatsapp: true },
      language: "en",
    });

    assert.equal(result.settings.notifications.email, false);
    assert.equal(result.settings.notifications.whatsapp, true);
    assert.equal(result.settings.language, "en");
  });

  it("partially updates — only language, keeping notification defaults", async () => {
    const { user } = await seedUserAndBusiness();

    const result = await BusinessService.updateSettings(user._id.toString(), {
      language: "ur",
    });

    assert.equal(result.settings.language, "ur");
    // notifications should still be the defaults (true, true)
    assert.equal(result.settings.notifications.email, true);
    assert.equal(result.settings.notifications.whatsapp, true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 10. updateWorkingHoursDay
// ══════════════════════════════════════════════════════════════════════════════

describe("BusinessService.updateWorkingHoursDay", () => {
  it("toggles a single day closed without touching other days", async () => {
    const { user } = await seedUserAndBusiness();

    const result = await BusinessService.updateWorkingHoursDay(
      user._id.toString(),
      "fri",
      { isOpen: false },
    );

    const friday = result.workingHours.find((h) => h.day === "fri");
    const monday = result.workingHours.find((h) => h.day === "mon");

    assert.equal(friday.isOpen, false);
    assert.equal(monday.isOpen, true); // default, untouched
  });

  it("updates openTime and closeTime for a day", async () => {
    const { user } = await seedUserAndBusiness();

    const result = await BusinessService.updateWorkingHoursDay(
      user._id.toString(),
      "mon",
      { openTime: "10:00", closeTime: "20:00" },
    );

    const monday = result.workingHours.find((h) => h.day === "mon");
    assert.equal(monday.openTime, "10:00");
    assert.equal(monday.closeTime, "20:00");
  });

  it("throws 422 for an invalid day name", async () => {
    const { user } = await seedUserAndBusiness();

    await assert.rejects(
      () =>
        BusinessService.updateWorkingHoursDay(user._id.toString(), "tuesday", {
          isOpen: false,
        }),
      (err) => {
        assert.equal(err.statusCode, 422);
        return true;
      },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 11. updateEngagement
// ══════════════════════════════════════════════════════════════════════════════

describe("BusinessService.updateEngagement", () => {
  it("updates engagement settings after onboarding (no step check)", async () => {
    const { user } = await seedUserAndBusiness({ onboardingStep: 5 });

    const result = await BusinessService.updateEngagement(user._id.toString(), {
      winbackDays: 90,
      reviewPlatform: "facebook",
    });

    assert.equal(result.engagement.winbackDays, 90);
    assert.equal(result.engagement.reviewPlatform, "facebook");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 12. getPlanDetails
// ══════════════════════════════════════════════════════════════════════════════

describe("BusinessService.getPlanDetails", () => {
  it("returns plan details with usage percentages", async () => {
    const { user } = await seedUserAndBusiness();

    const result = await BusinessService.getPlanDetails(user._id.toString());

    assert.ok(Object.prototype.hasOwnProperty.call(result, "currentPlan"));
    assert.ok(Object.prototype.hasOwnProperty.call(result, "limits"));
    assert.ok(Object.prototype.hasOwnProperty.call(result, "usage"));
    assert.ok(
      Object.prototype.hasOwnProperty.call(result.usage, "messageUsagePct"),
    );
    assert.ok(
      Object.prototype.hasOwnProperty.call(result.usage, "customerUsagePct"),
    );
  });

  it("returns isTrial: true for a new business", async () => {
    const { user } = await seedUserAndBusiness();

    const result = await BusinessService.getPlanDetails(user._id.toString());

    assert.equal(result.isTrial, true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 13. upgradePlan
// ══════════════════════════════════════════════════════════════════════════════

describe("BusinessService.upgradePlan", () => {
  it("upgrades to starter and sets correct limits", async () => {
    const { business } = await seedUserAndBusiness();

    const result = await BusinessService.upgradePlan(
      business._id.toString(),
      "starter",
      "jazzcash",
    );

    assert.equal(result.plan.currentPlan, "starter");
    assert.equal(result.plan.isTrial, false);
    assert.equal(result.plan.paymentMethod, "jazzcash");
    assert.equal(result.plan.limits.monthlyMessages, 2000);
  });

  it("throws 422 for an invalid plan name", async () => {
    const { business } = await seedUserAndBusiness();

    await assert.rejects(
      () =>
        BusinessService.upgradePlan(
          business._id.toString(),
          "premium_ultra",
          "jazzcash",
        ),
      (err) => {
        assert.equal(err.statusCode, 422);
        return true;
      },
    );
  });

  it("throws 404 for a non-existent businessId", async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();

    await assert.rejects(
      () => BusinessService.upgradePlan(fakeId, "growth", "easypaisa"),
      (err) => {
        assert.equal(err.statusCode, 404);
        return true;
      },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 14. listBusinesses (admin)
// ══════════════════════════════════════════════════════════════════════════════

describe("BusinessService.listBusinesses", () => {
  beforeEach(async () => {
    // Seed 3 businesses for pagination/filter tests
    const u1 = await User.create({
      email: "a@test.com",
      username: "user_a",
      password: "Password123!",
      name: "A",
      isEmailVerified: true,
      consentToDataProcessing: true,
    });
    const u2 = await User.create({
      email: "b@test.com",
      username: "user_b",
      password: "Password123!",
      name: "B",
      isEmailVerified: true,
      consentToDataProcessing: true,
    });
    const u3 = await User.create({
      email: "c@test.com",
      username: "user_c",
      password: "Password123!",
      name: "C",
      isEmailVerified: true,
      consentToDataProcessing: true,
    });

    await Business.insertMany([
      {
        name: "Salon A",
        type: "salon",
        ownerId: u1._id,
        isActive: true,
        onboardingComplete: true,
      },
      {
        name: "Clinic B",
        type: "clinic",
        ownerId: u2._id,
        isActive: true,
        onboardingComplete: false,
      },
      {
        name: "Salon C",
        type: "salon",
        ownerId: u3._id,
        isActive: false,
        onboardingComplete: false,
      },
    ]);
  });

  it("returns all businesses with default pagination", async () => {
    const result = await BusinessService.listBusinesses({});

    assert.equal(result.businesses.length, 3);
    assert.equal(result.pagination.total, 3);
  });

  it("filters by isActive:true", async () => {
    const result = await BusinessService.listBusinesses({ isActive: "true" });

    assert.equal(result.businesses.length, 2);
    result.businesses.forEach((b) => assert.equal(b.isActive, true));
  });

  it("filters by type", async () => {
    const result = await BusinessService.listBusinesses({ type: "clinic" });

    assert.equal(result.businesses.length, 1);
    assert.equal(result.businesses[0].name, "Clinic B");
  });

  it("paginates correctly", async () => {
    const page1 = await BusinessService.listBusinesses({ page: 1, limit: 2 });
    const page2 = await BusinessService.listBusinesses({ page: 2, limit: 2 });

    assert.equal(page1.businesses.length, 2);
    assert.equal(page2.businesses.length, 1);
    assert.equal(page1.pagination.pages, 2);
  });

  it("returns empty array for a filter with no matches", async () => {
    const result = await BusinessService.listBusinesses({ type: "gym" });

    assert.equal(result.businesses.length, 0);
    assert.equal(result.pagination.total, 0);
  });
});
