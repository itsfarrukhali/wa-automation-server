import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import Business from "../src/models/business/business.model.js";
import Category from "../src/models/common/categorySchema.js";
import User from "../src/models/user.model.js";
import * as TemplateService from "../src/services/template.service.js";
import {
  resetWhatsAppFetchImplementation,
  setWhatsAppFetchImplementation,
} from "../src/utils/whatsapp/sendMessage.utils.js";

let mongod;
let ownsMongoConnection = false;

const seedContext = async ({ templateLimit = 3 } = {}) => {
  const user = await User.create({
    email: "template-owner@test.com",
    username: "templateowner",
    password: "Password123!",
    name: "Template Owner",
    isEmailVerified: true,
    consentToDataProcessing: true,
    role: "owner",
  });

  const business = await Business.create({
    name: "Template Salon",
    type: "salon",
    ownerId: user._id,
    onboardingStep: 5,
    onboardingComplete: true,
    whatsappVerified: true,
    whatsapp: {
      connectionStatus: "connected",
      wabaId: "waba-123",
      phoneNumberId: "phone-number-123",
      displayPhoneNumber: "+923001112222",
      accessToken: "plain-test-token",
      tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      templates: [],
    },
    plan: {
      currentPlan: "starter",
      limits: {
        monthlyMessages: 500,
        staffAccounts: 3,
        customers: 500,
        templates: templateLimit,
      },
      usage: {
        messagesThisMonth: 0,
        customerCount: 0,
      },
    },
  });

  user.businessId = business._id;
  await user.save();
  return { user, business };
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
  resetWhatsAppFetchImplementation();
  if (ownsMongoConnection) {
    await mongoose.disconnect();
    await mongod.stop();
  }
});

beforeEach(async () => {
  resetWhatsAppFetchImplementation();
  await Promise.all([
    Business.deleteMany({}),
    User.deleteMany({}),
  ]);
  await Category.findOneAndUpdate(
    { name: "salon" },
    { $set: { name: "salon", isActive: true } },
    { upsert: true, returnDocument: "after" },
  );
});

describe("TemplateService", () => {
  it("creates and lists local WhatsApp templates", async () => {
    const { user } = await seedContext();

    const created = await TemplateService.createTemplate(user._id.toString(), {
      name: "Appointment Reminder",
      language: "en",
      category: "UTILITY",
      status: "APPROVED",
      components: [{ type: "BODY", text: "Your appointment is tomorrow." }],
    });

    assert.equal(created.name, "appointment_reminder");
    assert.equal(created.status, "APPROVED");

    const list = await TemplateService.listTemplates(user._id.toString(), {
      status: "APPROVED",
    });

    assert.equal(list.total, 1);
    assert.equal(list.templates[0].name, "appointment_reminder");
  });

  it("blocks duplicate template name and language", async () => {
    const { user } = await seedContext();

    await TemplateService.createTemplate(user._id.toString(), {
      name: "Promo Offer",
      language: "en",
      category: "MARKETING",
    });

    await assert.rejects(
      () =>
        TemplateService.createTemplate(user._id.toString(), {
          name: "promo_offer",
          language: "en",
          category: "MARKETING",
        }),
      /already exists/,
    );
  });

  it("enforces plan template limits", async () => {
    const { user } = await seedContext({ templateLimit: 1 });

    await TemplateService.createTemplate(user._id.toString(), {
      name: "First Template",
      language: "en",
    });

    await assert.rejects(
      () =>
        TemplateService.createTemplate(user._id.toString(), {
          name: "Second Template",
          language: "en",
        }),
      /Template limit reached/,
    );
  });

  it("syncs approved templates from Meta", async () => {
    const { user } = await seedContext();

    setWhatsAppFetchImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            name: "appointment_reminder",
            language: "en",
            category: "UTILITY",
            status: "APPROVED",
            components: [{ type: "BODY", text: "Reminder text" }],
          },
        ],
      }),
    }));

    const result = await TemplateService.syncTemplatesFromMeta(
      user._id.toString(),
    );

    assert.equal(result.synced, 1);
    assert.equal(result.created, 1);
    assert.equal(result.templates[0].status, "APPROVED");
  });

  it("tracks template usage", async () => {
    const { user } = await seedContext();
    const template = await TemplateService.createTemplate(user._id.toString(), {
      name: "Review Request",
      language: "en",
      category: "UTILITY",
    });

    const updated = await TemplateService.markTemplateUsed(
      user._id.toString(),
      template.id.toString(),
    );

    assert.equal(updated.usageCount, 1);
    assert.ok(updated.lastUsed);
  });
});
