import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import Booking from "../src/models/booking.model.js";
import Business from "../src/models/business/business.model.js";
import Campaign from "../src/models/campaign.model.js";
import Category from "../src/models/common/categorySchema.js";
import Customer from "../src/models/customer.model.js";
import MessageLog from "../src/models/messagelog.model.js";
import Service from "../src/models/service.model.js";
import User from "../src/models/user.model.js";
import * as ReportService from "../src/services/report.service.js";

let mongod;
let ownsMongoConnection = false;

const seedContext = async () => {
  const owner = await User.create({
    email: "report-owner@test.com",
    username: "reportowner",
    password: "Password123!",
    name: "Report Owner",
    isEmailVerified: true,
    consentToDataProcessing: true,
    role: "owner",
  });

  const business = await Business.create({
    name: "Report Salon",
    type: "salon",
    ownerId: owner._id,
    onboardingStep: 5,
    onboardingComplete: true,
    plan: {
      currentPlan: "starter",
      limits: {
        monthlyMessages: 500,
        staffAccounts: 3,
        customers: 500,
      },
      usage: {
        messagesThisMonth: 0,
        customerCount: 0,
      },
    },
  });

  owner.businessId = business._id;
  await owner.save();

  const customer = await Customer.create({
    businessId: business._id,
    name: "Ayesha Report",
    phone: "03001234567",
    whatsappNumber: "03001234567",
    whatsappOptIn: true,
    consentGiven: true,
    tags: ["vip"],
    totalSpent: 2500,
    totalVisits: 1,
  });

  const service = await Service.create({
    businessId: business._id,
    name: "Haircut",
    price: 2500,
    duration: 45,
    category: "Hair",
    createdBy: owner._id,
  });

  const scheduledAt = new Date(Date.now() + 60 * 60 * 1000);
  const booking = await Booking.create({
    businessId: business._id,
    customerId: customer._id,
    serviceId: service._id,
    staffId: owner._id,
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
    staffDetails: { name: owner.name },
    status: "completed",
    totalAmount: 2500,
    amountPaid: 2500,
    createdBy: owner._id,
    updatedBy: owner._id,
  });

  await MessageLog.create({
    businessId: business._id,
    customerId: customer._id,
    staffId: owner._id,
    type: "manual",
    direction: "out",
    contentType: "text",
    content: "Report message",
    status: "read",
    waCustomerPhone: customer.whatsappNumber,
  });

  await Campaign.create({
    businessId: business._id,
    name: "Report Campaign",
    type: "promo",
    target: { tags: ["vip"], estimatedRecipients: 1 },
    message: "Hi {{name}}",
    whatsappTemplate: {
      templateName: "report_campaign",
      language: "en",
      category: "MARKETING",
    },
    createdBy: owner._id,
    status: "completed",
    metrics: {
      totalTargeted: 1,
      eligibleRecipients: 1,
      sent: 1,
      read: 1,
      failed: 0,
    },
  });

  return { owner, business, customer, service, booking };
};

const range = () => ({
  dateFrom: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  dateTo: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
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
  if (ownsMongoConnection) {
    await mongoose.disconnect();
    await mongod.stop();
  }
});

beforeEach(async () => {
  await Promise.all([
    Booking.deleteMany({}),
    Business.deleteMany({}),
    Campaign.deleteMany({}),
    Customer.deleteMany({}),
    MessageLog.deleteMany({}),
    Service.deleteMany({}),
    User.deleteMany({}),
  ]);
  await Category.findOneAndUpdate(
    { name: "salon" },
    { $set: { name: "salon", isActive: true } },
    { upsert: true, returnDocument: "after" },
  );
});

describe("ReportService", () => {
  it("returns overview report totals", async () => {
    const { owner } = await seedContext();

    const report = await ReportService.getOverviewReport(
      owner._id.toString(),
      range(),
    );

    assert.equal(report.bookings.total, 1);
    assert.equal(report.bookings.completed, 1);
    assert.equal(report.revenue.collected, 2500);
    assert.equal(report.customers.optedIn, 1);
    assert.equal(report.messages.total, 1);
    assert.equal(report.campaigns.sent, 1);
  });

  it("returns revenue daily series", async () => {
    const { owner } = await seedContext();

    const report = await ReportService.getRevenueReport(
      owner._id.toString(),
      range(),
    );

    assert.equal(report.totals.collected, 2500);
    assert.equal(report.totals.bookings, 1);
    assert.equal(report.daily.length, 1);
  });

  it("returns booking status and service analytics", async () => {
    const { owner } = await seedContext();

    const report = await ReportService.getBookingReport(
      owner._id.toString(),
      range(),
    );

    assert.equal(report.byStatus.completed, 1);
    assert.equal(report.topServices[0].service, "Haircut");
  });

  it("returns customer segments and top customers", async () => {
    const { owner } = await seedContext();

    const report = await ReportService.getCustomerReport(owner._id.toString());

    assert.ok(report.segments.some((segment) => segment.tag === "vip"));
    assert.equal(report.topCustomers[0].name, "Ayesha Report");
  });
});
