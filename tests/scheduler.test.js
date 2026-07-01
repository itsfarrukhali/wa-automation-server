import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import Booking from "../src/models/booking.model.js";
import Business from "../src/models/business/business.model.js";
import Category from "../src/models/common/categorySchema.js";
import Customer from "../src/models/customer.model.js";
import MessageLog from "../src/models/messagelog.model.js";
import SchedulerLock from "../src/models/schedulerLock.model.js";
import Service from "../src/models/service.model.js";
import User from "../src/models/user.model.js";
import * as SchedulerService from "../src/services/scheduler.service.js";
import {
  resetWhatsAppFetchImplementation,
  setWhatsAppFetchImplementation,
} from "../src/utils/whatsapp/sendMessage.utils.js";

let mongod;
let ownsMongoConnection = false;

const seedContext = async () => {
  const user = await User.create({
    email: "scheduler-owner@test.com",
    username: "schedulerowner",
    password: "Password123!",
    name: "Scheduler Owner",
    isEmailVerified: true,
    consentToDataProcessing: true,
    role: "owner",
  });

  const business = await Business.create({
    name: "Scheduler Salon",
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
        monthlyMessages: 2000,
        staffAccounts: 3,
        customers: 500,
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
    name: "Reminder Customer",
    phone: "+923001234567",
    whatsappNumber: "+923001234567",
    whatsappOptIn: true,
    consentGiven: true,
    source: "manual",
  });

  const service = await Service.create({
    businessId: business._id,
    name: "Haircut",
    price: 2500,
    duration: 45,
    category: "Hair",
    createdBy: user._id,
  });

  return { user, business, customer, service };
};

const createBooking = async ({
  business,
  customer,
  service,
  user,
  status,
  scheduledAt,
  reminderDue = false,
  followUpDue = false,
}) => {
  const booking = await Booking.create({
    businessId: business._id,
    customerId: customer._id,
    serviceId: service._id,
    staffId: user._id,
    scheduledAt,
    serviceDetails: {
      name: service.name,
      duration: service.duration,
      price: service.price,
      category: service.category,
    },
    customerDetails: {
      name: customer.name,
      phone: customer.phone,
      whatsappNumber: customer.whatsappNumber,
    },
    staffDetails: {
      name: user.name,
    },
    totalAmount: service.price,
    status,
    createdBy: user._id,
    updatedBy: user._id,
  });

  if (reminderDue) {
    booking.whatsapp.reminder = {
      scheduledFor: new Date(Date.now() - 60 * 1000),
      status: "scheduled",
      reminderType: "24h",
    };
  }

  if (followUpDue) {
    booking.whatsapp.followUp = {
      scheduledFor: new Date(Date.now() - 60 * 1000),
      status: "scheduled",
    };
    booking.completedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
  }

  await booking.save();
  return booking;
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
    Booking.deleteMany({}),
    Business.deleteMany({}),
    Customer.deleteMany({}),
    MessageLog.deleteMany({}),
    SchedulerLock.deleteMany({}),
    Service.deleteMany({}),
    User.deleteMany({}),
  ]);
  await Category.findOneAndUpdate(
    { name: "salon" },
    { $set: { name: "salon", isActive: true } },
    { upsert: true, returnDocument: "after" },
  );
});

describe("SchedulerService", () => {
  it("lists due reminders without sending messages", async () => {
    const { user, business, customer, service } = await seedContext();
    await createBooking({
      business,
      customer,
      service,
      user,
      status: "confirmed",
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      reminderDue: true,
    });

    const due = await SchedulerService.getDueScheduledMessages(
      user._id.toString(),
      { type: "reminder" },
    );

    assert.equal(due.totals.reminders, 1);
    assert.equal(due.totals.followUps, 0);
  });

  it("supports dry-run scheduler execution", async () => {
    const { user, business, customer, service } = await seedContext();
    await createBooking({
      business,
      customer,
      service,
      user,
      status: "confirmed",
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      reminderDue: true,
    });

    const result = await SchedulerService.runDueScheduledMessages(
      user._id.toString(),
      { type: "all", dryRun: true },
    );

    assert.equal(result.dryRun, true);
    assert.equal(result.totals.reminders, 1);
    assert.equal(await MessageLog.countDocuments({}), 0);
  });

  it("sends due reminder messages and marks booking reminder sent", async () => {
    const { user, business, customer, service } = await seedContext();
    const booking = await createBooking({
      business,
      customer,
      service,
      user,
      status: "confirmed",
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      reminderDue: true,
    });

    setWhatsAppFetchImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: "wamid.reminder-1" }] }),
    }));

    const result = await SchedulerService.runDueScheduledMessages(
      user._id.toString(),
      { type: "reminder" },
    );

    assert.equal(result.results[0].action, "sent");

    const updatedBooking = await Booking.findById(booking._id);
    assert.equal(updatedBooking.whatsapp.reminder.status, "sent");
    assert.equal(updatedBooking.reminderSent, true);

    const log = await MessageLog.findOne({ waMessageId: "wamid.reminder-1" });
    assert.equal(log.type, "booking_reminder");
  });

  it("sends due follow-up messages and marks booking follow-up sent", async () => {
    const { user, business, customer, service } = await seedContext();
    const booking = await createBooking({
      business,
      customer,
      service,
      user,
      status: "completed",
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      followUpDue: true,
    });

    setWhatsAppFetchImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: "wamid.followup-1" }] }),
    }));

    const result = await SchedulerService.runDueScheduledMessages(
      user._id.toString(),
      { type: "follow_up" },
    );

    assert.equal(result.results[0].action, "sent");

    const updatedBooking = await Booking.findById(booking._id);
    assert.equal(updatedBooking.whatsapp.followUp.status, "sent");
    assert.equal(updatedBooking.followUpSent, true);

    const log = await MessageLog.findOne({ waMessageId: "wamid.followup-1" });
    assert.equal(log.type, "booking_followup");
  });

  it("runs scheduler across connected businesses with a MongoDB lock", async () => {
    const { user, business, customer, service } = await seedContext();
    await createBooking({
      business,
      customer,
      service,
      user,
      status: "confirmed",
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      reminderDue: true,
    });

    setWhatsAppFetchImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: "wamid.worker-reminder-1" }] }),
    }));

    const result = await SchedulerService.runScheduledMessagesAcrossBusinesses({
      type: "all",
      owner: "test-worker",
    });

    assert.equal(result.skipped, false);
    assert.equal(result.businesses, 1);
    assert.equal(result.sent, 1);

    const lock = await SchedulerLock.findOne({ key: "whatsapp_scheduler" });
    assert.equal(lock.owner, "test-worker");
    assert.ok(lock.lastFinishedAt);
  });
});
