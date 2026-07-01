import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import Business from "../src/models/business/business.model.js";
import Campaign from "../src/models/campaign.model.js";
import Category from "../src/models/common/categorySchema.js";
import Customer from "../src/models/customer.model.js";
import MessageLog from "../src/models/messagelog.model.js";
import User from "../src/models/user.model.js";
import * as CampaignService from "../src/services/campaign.service.js";
import {
  resetWhatsAppFetchImplementation,
  setWhatsAppFetchImplementation,
} from "../src/utils/whatsapp/sendMessage.utils.js";

let mongod;
let ownsMongoConnection = false;

const seedContext = async ({ monthlyMessages = 500 } = {}) => {
  const user = await User.create({
    email: "campaign-owner@test.com",
    username: "campaignowner",
    password: "Password123!",
    name: "Campaign Owner",
    isEmailVerified: true,
    consentToDataProcessing: true,
    role: "owner",
  });

  const business = await Business.create({
    name: "Campaign Salon",
    type: "salon",
    ownerId: user._id,
    onboardingStep: 5,
    onboardingComplete: true,
    whatsappVerified: true,
    whatsapp: {
      connectionStatus: "connected",
      phoneNumberId: "phone-number-123",
      displayPhoneNumber: "+923001112222",
      accessToken: "plain-test-token",
      tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
    plan: {
      currentPlan: "starter",
      limits: {
        monthlyMessages,
        staffAccounts: 3,
        customers: 500,
        campaigns: 5,
      },
      usage: {
        messagesThisMonth: 0,
        customerCount: 0,
      },
    },
  });

  user.businessId = business._id;
  await user.save();

  const [vipCustomer, regularCustomer, optedOutCustomer] = await Customer.create([
    {
      businessId: business._id,
      name: "Ayesha Khan",
      phone: "03001234567",
      whatsappNumber: "03001234567",
      whatsappOptIn: true,
      consentGiven: true,
      tags: ["vip"],
      totalVisits: 5,
      totalSpent: 15000,
    },
    {
      businessId: business._id,
      name: "Sara Ali",
      phone: "03007654321",
      whatsappNumber: "03007654321",
      whatsappOptIn: true,
      consentGiven: true,
      tags: ["regular"],
      totalVisits: 2,
      totalSpent: 5000,
    },
    {
      businessId: business._id,
      name: "Opted Out",
      phone: "03009876543",
      whatsappNumber: "03009876543",
      whatsappOptIn: false,
      consentGiven: true,
      tags: ["vip"],
    },
  ]);

  return {
    user,
    business,
    vipCustomer,
    regularCustomer,
    optedOutCustomer,
  };
};

const campaignPayload = (overrides = {}) => ({
  name: "VIP Eid Offer",
  type: "promo",
  target: {
    tags: ["vip"],
  },
  message:
    "Assalam o alaikum {{name}}! {{business}} has a VIP Eid offer for you.",
  whatsappTemplate: {
    templateName: "vip_eid_offer",
    language: "en",
    category: "MARKETING",
  },
  ...overrides,
});

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
    Campaign.deleteMany({}),
    Customer.deleteMany({}),
    MessageLog.deleteMany({}),
    User.deleteMany({}),
  ]);
  await Category.findOneAndUpdate(
    { name: "salon" },
    { $set: { name: "salon", isActive: true } },
    { upsert: true, returnDocument: "after" },
  );
});

describe("CampaignService", () => {
  it("creates a draft campaign and estimates eligible opted-in recipients", async () => {
    const { user } = await seedContext();

    const result = await CampaignService.createCampaign(
      user._id.toString(),
      campaignPayload(),
    );

    assert.equal(result.campaign.status, "draft");
    assert.equal(result.campaign.metrics.totalTargeted, 1);
    assert.equal(result.preview.estimatedRecipients, 1);
    assert.equal(result.preview.sampleRecipients[0].name, "Ayesha Khan");
  });

  it("previews recipients using custom targeting filters", async () => {
    const { user } = await seedContext();

    const result = await CampaignService.previewCampaignRecipients(user._id.toString(), {
      target: {
        filters: {
          minVisits: 2,
        },
      },
      limit: 10,
    });

    assert.equal(result.total, 2);
    assert.deepEqual(
      result.recipients.map((customer) => customer.name).sort(),
      ["Ayesha Khan", "Sara Ali"],
    );
  });

  it("dry-runs launch without creating message logs", async () => {
    const { user } = await seedContext();
    const { campaign } = await CampaignService.createCampaign(
      user._id.toString(),
      campaignPayload(),
    );

    const result = await CampaignService.launchCampaign(
      user._id.toString(),
      campaign._id.toString(),
      { dryRun: true },
    );

    assert.equal(result.dryRun, true);
    assert.equal(result.totalEligible, 1);
    assert.equal(await MessageLog.countDocuments({}), 0);
  });

  it("launches a campaign, sends WhatsApp messages, and updates metrics", async () => {
    const { user, business } = await seedContext();
    const { campaign } = await CampaignService.createCampaign(
      user._id.toString(),
      campaignPayload(),
    );

    setWhatsAppFetchImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: "wamid.campaign-1" }] }),
    }));

    const result = await CampaignService.launchCampaign(
      user._id.toString(),
      campaign._id.toString(),
      {},
    );

    assert.equal(result.sent, 1);
    assert.equal(result.failed, 0);
    assert.equal(result.campaign.status, "completed");
    assert.equal(result.campaign.metrics.sent, 1);

    const log = await MessageLog.findOne({ waMessageId: "wamid.campaign-1" });
    assert.equal(log.type, "campaign_promo");
    assert.equal(log.campaignId.toString(), campaign._id.toString());

    const updatedBusiness = await Business.findById(business._id);
    assert.equal(updatedBusiness.plan.usage.messagesThisMonth, 1);
  });

  it("blocks launch when campaign exceeds remaining monthly message limit", async () => {
    const { user } = await seedContext({ monthlyMessages: 0 });
    const { campaign } = await CampaignService.createCampaign(
      user._id.toString(),
      campaignPayload(),
    );

    await assert.rejects(
      () =>
        CampaignService.launchCampaign(
          user._id.toString(),
          campaign._id.toString(),
          {},
        ),
      /only 0 monthly messages remain/,
    );
  });
});
