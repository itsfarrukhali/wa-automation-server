import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import Business from "../src/models/business/business.model.js";
import AutomationRule from "../src/models/automationRule.model.js";
import Category from "../src/models/common/categorySchema.js";
import Customer from "../src/models/customer.model.js";
import MessageLog from "../src/models/messagelog.model.js";
import User from "../src/models/user.model.js";
import * as MessageService from "../src/services/message.service.js";
import * as WebhookService from "../src/services/webhook.service.js";
import {
  resetWhatsAppFetchImplementation,
  setWhatsAppFetchImplementation,
} from "../src/utils/whatsapp/sendMessage.utils.js";

let mongod;
let ownsMongoConnection = false;

const seedBusinessContext = async (overrides = {}) => {
  const user = await User.create({
    email: overrides.email ?? "owner-message@test.com",
    username: overrides.username ?? "messageowner",
    password: "Password123!",
    name: "Message Owner",
    isEmailVerified: true,
    consentToDataProcessing: true,
    role: "owner",
  });

  const business = await Business.create({
    name: "Message Salon",
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
      currentPlan: "free",
      limits: {
        monthlyMessages: 500,
        staffAccounts: 1,
        customers: 100,
      },
      usage: {
        messagesThisMonth: 0,
        customerCount: 0,
      },
    },
  });

  user.businessId = business._id;
  await user.save();

  const customer = await Customer.create({
    businessId: business._id,
    name: "Ayesha Khan",
    phone: "+923001234567",
    whatsappNumber: "+923001234567",
    whatsappOptIn: overrides.whatsappOptIn ?? true,
    consentGiven: true,
    source: "manual",
  });

  return { user, business, customer };
};

const sampleWebhookPayload = (phoneNumberId = "phone-number-123") => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "waba-1",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "923001112222",
              phone_number_id: phoneNumberId,
            },
            contacts: [
              {
                profile: { name: "Fatima Customer" },
                wa_id: "923009998888",
              },
            ],
            messages: [
              {
                from: "923009998888",
                id: "wamid.inbound-1",
                timestamp: "1719000000",
                type: "text",
                text: { body: "Assalam o alaikum, timing kya hai?" },
              },
            ],
          },
        },
      ],
    },
  ],
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
    Customer.deleteMany({}),
    MessageLog.deleteMany({}),
    AutomationRule.deleteMany({}),
    User.deleteMany({}),
  ]);
  await Category.findOneAndUpdate(
    { name: "salon" },
    { $set: { name: "salon", isActive: true } },
    { upsert: true, returnDocument: "after" },
  );
});

describe("MessageService.sendTextMessage", () => {
  it("sends a WhatsApp text message and stores the provider message ID", async () => {
    const { user, business, customer } = await seedBusinessContext();
    let captured;

    setWhatsAppFetchImplementation(async (url, options) => {
      captured = { url, options };
      return {
        ok: true,
        status: 200,
        json: async () => ({ messages: [{ id: "wamid.sent-1" }] }),
      };
    });

    const message = await MessageService.sendTextMessage(user._id.toString(), {
      customerId: customer._id.toString(),
      text: "Your appointment is confirmed.",
      previewUrl: true,
    });

    assert.equal(message.status, "sent");
    assert.equal(message.waMessageId, "wamid.sent-1");
    assert.match(captured.url, /phone-number-123\/messages$/);

    const payload = JSON.parse(captured.options.body);
    assert.equal(payload.to, "923001234567");
    assert.equal(payload.text.body, "Your appointment is confirmed.");

    const updatedBusiness = await Business.findById(business._id);
    assert.equal(updatedBusiness.plan.usage.messagesThisMonth, 1);
    assert.equal(updatedBusiness.whatsapp.messages.total, 1);
  });

  it("blocks WhatsApp sends when a customer has opted out", async () => {
    const { user, customer } = await seedBusinessContext({
      whatsappOptIn: false,
    });

    await assert.rejects(
      () =>
        MessageService.sendTextMessage(user._id.toString(), {
          customerId: customer._id.toString(),
          text: "Promo message",
        }),
      /not opted in/i,
    );
  });

  it("stores failed outbound messages when Meta rejects the request", async () => {
    const { user, customer } = await seedBusinessContext();

    setWhatsAppFetchImplementation(async () => ({
      ok: false,
      status: 400,
      json: async () => ({
        error: { message: "Invalid recipient", code: 131026 },
      }),
    }));

    await assert.rejects(
      () =>
        MessageService.sendTextMessage(user._id.toString(), {
          customerId: customer._id.toString(),
          text: "Hello",
        }),
      /Invalid recipient/,
    );

    const failed = await MessageLog.findOne({ status: "failed" });
    assert.equal(failed.errorCode, "131026");
    assert.equal(failed.content, "Hello");
  });

  it("allows multiple pending messages before Meta returns a waMessageId", async () => {
    const { business, customer, user } = await seedBusinessContext();

    await MessageLog.create({
      businessId: business._id,
      customerId: customer._id,
      staffId: user._id,
      type: "manual",
      direction: "out",
      contentType: "text",
      content: "Pending one",
      status: "pending",
    });

    await MessageLog.create({
      businessId: business._id,
      customerId: customer._id,
      staffId: user._id,
      type: "manual",
      direction: "out",
      contentType: "text",
      content: "Pending two",
      status: "pending",
    });

    const pendingCount = await MessageLog.countDocuments({ status: "pending" });
    assert.equal(pendingCount, 2);
  });

  it("uses the free plan default limit when legacy businesses have no limits", async () => {
    const { user, business, customer } = await seedBusinessContext();
    business.plan.limits = undefined;
    business.markModified("plan");
    await business.save();

    setWhatsAppFetchImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: "wamid.sent-legacy-plan" }] }),
    }));

    const message = await MessageService.sendTextMessage(user._id.toString(), {
      customerId: customer._id.toString(),
      text: "Legacy plan should still send",
    });

    assert.equal(message.status, "sent");
  });

  it("falls back to env WA_TOKEN when stored business token cannot decrypt", async () => {
    const { user, business, customer } = await seedBusinessContext();
    business.whatsapp.accessToken = JSON.stringify({
      encrypted: "bad",
      iv: "00112233445566778899aabbccddeeff",
      tag: "00112233445566778899aabbccddeeff",
    });
    business.markModified("whatsapp");
    await business.save();

    let authHeader;
    setWhatsAppFetchImplementation(async (_url, options) => {
      authHeader = options.headers.Authorization;
      return {
        ok: true,
        status: 200,
        json: async () => ({ messages: [{ id: "wamid.sent-env-fallback" }] }),
      };
    });

    const message = await MessageService.sendTextMessage(user._id.toString(), {
      customerId: customer._id.toString(),
      text: "Use env token fallback",
    });

    assert.equal(message.status, "sent");
    assert.equal(authHeader, `Bearer ${process.env.WA_TOKEN}`);
  });
});

describe("WebhookService", () => {
  it("verifies the WhatsApp webhook challenge", () => {
    const challenge = WebhookService.verifyWhatsAppWebhook({
      "hub.mode": "subscribe",
      "hub.verify_token": process.env.WEBHOOK_VERIFY_TOKEN,
      "hub.challenge": "challenge-123",
    });

    assert.equal(challenge, "challenge-123");
  });

  it("creates customer and inbound message records from WhatsApp webhooks", async () => {
    const { business } = await seedBusinessContext();

    const result = await WebhookService.processWhatsAppWebhook(
      sampleWebhookPayload(),
    );

    assert.equal(result.processed, 1);
    assert.equal(result.results[0].action, "created_inbound");

    const customer = await Customer.findOne({
      businessId: business._id,
      phone: "+923009998888",
    });
    assert.equal(customer.name, "Fatima Customer");
    assert.equal(customer.source, "whatsapp");

    const inbound = await MessageLog.findOne({ waMessageId: "wamid.inbound-1" });
    assert.equal(inbound.direction, "in");
    assert.equal(inbound.content, "Assalam o alaikum, timing kya hai?");

    const updatedBusiness = await Business.findById(business._id);
    assert.equal(updatedBusiness.whatsapp.webhookEvents.length, 1);
    assert.equal(updatedBusiness.whatsapp.webhookEvents[0].event, "inbound_message");
  });

  it("groups recent messages into an inbox conversation list", async () => {
    const { user, business, customer } = await seedBusinessContext();
    await MessageLog.create({
      businessId: business._id,
      customerId: customer._id,
      type: "inbound",
      direction: "in",
      contentType: "text",
      content: "Hello, I need help",
      status: "delivered",
      waMessageId: "wamid.inbox-1",
      requiredHumanIntervention: true,
    });

    const inbox = await MessageService.getInbox(user._id.toString(), {
      status: "needs_human",
    });

    assert.equal(inbox.conversations.length, 1);
    assert.equal(inbox.conversations[0].unreadCount, 1);
    assert.equal(inbox.conversations[0].needsHuman, true);
  });

  it("sends an automation rule reply when inbound text matches keywords", async () => {
    const { user, business } = await seedBusinessContext();
    await AutomationRule.create({
      businessId: business._id,
      name: "Timing reply",
      priority: 1,
      trigger: {
        type: "contains_any",
        keywords: ["timing", "hours"],
      },
      response: {
        type: "text",
        text: "We are open from 10 AM to 8 PM.",
      },
      createdBy: user._id,
    });

    setWhatsAppFetchImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: "wamid.automation-1" }] }),
    }));

    const result = await WebhookService.processWhatsAppWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: {
                  display_phone_number: "923001112222",
                  phone_number_id: "phone-number-123",
                },
                contacts: [
                  {
                    profile: { name: "Automation Customer" },
                    wa_id: "923001111111",
                  },
                ],
                messages: [
                  {
                    from: "923001111111",
                    id: "wamid.auto-inbound-1",
                    timestamp: "1719000000",
                    type: "text",
                    text: { body: "What is your timing?" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    assert.equal(result.results[0].automations[0].action, "automation_sent");

    const automationReply = await MessageLog.findOne({
      waMessageId: "wamid.automation-1",
    });
    assert.equal(automationReply.type, "quick_reply");
    assert.equal(automationReply.status, "sent");

    const inbound = await MessageLog.findOne({ waMessageId: "wamid.auto-inbound-1" });
    assert.equal(inbound.requiredHumanIntervention, false);

    const rule = await AutomationRule.findOne({ name: "Timing reply" });
    assert.equal(rule.metrics.sentCount, 1);
  });

  it("opts out customers when they send STOP", async () => {
    const { business } = await seedBusinessContext();

    const result = await WebhookService.processWhatsAppWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: {
                  display_phone_number: "923001112222",
                  phone_number_id: "phone-number-123",
                },
                contacts: [
                  {
                    profile: { name: "Opt Out Customer" },
                    wa_id: "923002222222",
                  },
                ],
                messages: [
                  {
                    from: "923002222222",
                    id: "wamid.stop-1",
                    timestamp: "1719000000",
                    type: "text",
                    text: { body: "STOP" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    assert.equal(result.results[0].action, "customer_opted_out");

    const customer = await Customer.findOne({
      businessId: business._id,
      phone: "+923002222222",
    });
    assert.equal(customer.whatsappOptIn, false);
    assert.equal(customer.optedOut, true);
    assert.equal(customer.optOutReason, "user_request");
  });

  it("updates outbound message status from WhatsApp delivery webhooks", async () => {
    const { business, customer } = await seedBusinessContext();
    await MessageLog.create({
      businessId: business._id,
      customerId: customer._id,
      type: "manual",
      direction: "out",
      contentType: "text",
      content: "Hello",
      status: "sent",
      waMessageId: "wamid.status-1",
    });

    const result = await WebhookService.processWhatsAppWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "phone-number-123" },
                statuses: [
                  {
                    id: "wamid.status-1",
                    status: "delivered",
                    timestamp: "1719000010",
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    assert.equal(result.results[0].action, "updated_status");

    const message = await MessageLog.findOne({ waMessageId: "wamid.status-1" });
    assert.equal(message.status, "delivered");

    const updatedBusiness = await Business.findById(business._id);
    assert.equal(updatedBusiness.whatsapp.messages.delivered, 1);
    assert.equal(updatedBusiness.whatsapp.webhookEvents.length, 1);
    assert.equal(updatedBusiness.whatsapp.webhookEvents[0].event, "status_update");
  });
});
