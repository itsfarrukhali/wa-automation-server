import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import app from "../app.js";
import * as BookingService from "../src/services/booking.service.js";
import Booking from "../src/models/booking.model.js";
import Business from "../src/models/business/business.model.js";
import Category from "../src/models/common/categorySchema.js";
import Customer from "../src/models/customer.model.js";
import Service from "../src/models/service.model.js";
import User from "../src/models/user.model.js";

let mongod;
let owner;
let business;
let customer;
let service;

const futureOpenTime = (daysAhead = 2, hour = 10) => {
  const now = new Date();
  const karachiNow = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Karachi" }),
  );
  karachiNow.setDate(karachiNow.getDate() + daysAhead);
  while (karachiNow.getDay() === 0) {
    karachiNow.setDate(karachiNow.getDate() + 1);
  }
  const year = karachiNow.getFullYear();
  const month = String(karachiNow.getMonth() + 1).padStart(2, "0");
  const day = String(karachiNow.getDate()).padStart(2, "0");
  return new Date(
    `${year}-${month}-${day}T${String(hour).padStart(2, "0")}:00:00+05:00`,
  );
};

const createTenant = async (suffix) => {
  const safe = String(suffix).replace(/\D/g, "").slice(-12);
  const user = await User.create({
    email: `booking-${suffix}@test.com`,
    username: `booking_${safe}`,
    password: "Password123!",
    name: "Booking Owner",
    isEmailVerified: true,
    consentToDataProcessing: true,
    role: "owner",
  });
  const tenantBusiness = await Business.create({
    name: `Booking Salon ${suffix}`,
    type: "salon",
    ownerId: user._id,
    plan: {
      limits: {
        monthlyMessages: 500,
        staffAccounts: 1,
        customers: 100,
      },
    },
  });
  user.businessId = tenantBusiness._id;
  await user.save();
  return { user, business: tenantBusiness };
};

const seedCatalog = async () => {
  customer = await Customer.create({
    businessId: business._id,
    name: "Ayesha Customer",
    phone: "03001234567",
  });
  service = await Service.create({
    businessId: business._id,
    name: "Haircut",
    price: 1500,
    duration: 45,
    bufferBefore: 5,
    bufferAfter: 5,
    createdBy: owner._id,
  });
};

const createBooking = (overrides = {}) =>
  BookingService.createBooking(owner._id, {
    customerId: customer._id,
    serviceId: service._id,
    staffId: owner._id,
    scheduledAt: futureOpenTime(),
    ...overrides,
  });

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Category.create({
    name: "salon",
    displayName: "Salon",
    isActive: true,
  });
});

after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await Promise.all([
    Booking.deleteMany({}),
    Customer.deleteMany({}),
    Service.deleteMany({}),
    Business.deleteMany({}),
    User.deleteMany({}),
  ]);
  ({ user: owner, business } = await createTenant(Date.now()));
  await seedCatalog();
});

describe("Booking service", () => {
  it("creates a booking with denormalized customer and service details", async () => {
    const booking = await createBooking();

    assert.equal(booking.businessId.toString(), business._id.toString());
    assert.equal(booking.customerDetails.name, customer.name);
    assert.equal(booking.serviceDetails.name, service.name);
    assert.equal(booking.totalAmount, 1500);
    assert.equal(booking.amountDue, 1500);
  });

  it("increments customer and service appointment metrics once on creation", async () => {
    await createBooking();
    const updatedCustomer = await Customer.findById(customer._id);
    const updatedService = await Service.findById(service._id);

    assert.equal(updatedCustomer.totalAppointments, 1);
    assert.equal(updatedService.analytics.totalBookings, 1);
  });

  it("rejects a customer belonging to another tenant", async () => {
    const other = await createTenant(`${Date.now()}9`);
    const foreignCustomer = await Customer.create({
      businessId: other.business._id,
      name: "Foreign",
      phone: "03011234567",
    });

    await assert.rejects(
      () => createBooking({ customerId: foreignCustomer._id }),
      (error) => error.statusCode === 404,
    );
  });

  it("rejects inactive services", async () => {
    service.isActive = false;
    await service.save();
    await assert.rejects(
      () => createBooking(),
      (error) => error.statusCode === 404,
    );
  });

  it("rejects bookings outside business hours", async () => {
    await assert.rejects(
      () => createBooking({ scheduledAt: futureOpenTime(2, 20) }),
      (error) => error.statusCode === 422,
    );
  });

  it("rejects overlapping bookings for the same staff member", async () => {
    await createBooking();
    await assert.rejects(
      () =>
        createBooking({
          scheduledAt: new Date(futureOpenTime().getTime() + 15 * 60 * 1000),
        }),
      (error) => error.statusCode === 409,
    );
  });

  it("allows overlapping bookings when no staff member is assigned", async () => {
    await createBooking({ staffId: undefined });
    const second = await createBooking({ staffId: undefined });
    assert.ok(second._id);
  });

  it("lists and filters bookings within the tenant", async () => {
    await createBooking({ status: "confirmed" });
    const result = await BookingService.listBookings(owner._id, {
      status: "confirmed",
    });
    assert.equal(result.pagination.total, 1);
  });

  it("does not expose another tenant's bookings", async () => {
    const other = await createTenant(`${Date.now()}8`);
    const result = await BookingService.listBookings(other.user._id);
    assert.equal(result.pagination.total, 0);
  });

  it("updates schedule and notes while checking conflicts", async () => {
    const booking = await createBooking();
    const updated = await BookingService.updateBooking(owner._id, booking._id, {
      scheduledAt: futureOpenTime(3, 11),
      notes: "Updated notes",
    });
    assert.equal(updated.notes, "Updated notes");
    assert.equal(updated.scheduledAt.toISOString(), futureOpenTime(3, 11).toISOString());
  });

  it("follows valid booking status transitions", async () => {
    const booking = await createBooking();
    const confirmed = await BookingService.updateBookingStatus(
      owner._id,
      booking._id,
      "confirmed",
    );
    const arrived = await BookingService.updateBookingStatus(
      owner._id,
      booking._id,
      "arrived",
    );
    assert.equal(confirmed.status, "confirmed");
    assert.equal(arrived.status, "arrived");
  });

  it("rejects invalid status jumps", async () => {
    const booking = await createBooking();
    await assert.rejects(
      () =>
        BookingService.updateBookingStatus(
          owner._id,
          booking._id,
          "completed",
        ),
      (error) => error.statusCode === 409,
    );
  });

  it("updates customer and service metrics exactly once on completion", async () => {
    const booking = await createBooking();
    await BookingService.updateBookingStatus(
      owner._id,
      booking._id,
      "confirmed",
    );
    await BookingService.updateBookingStatus(
      owner._id,
      booking._id,
      "arrived",
    );
    await BookingService.updateBookingStatus(
      owner._id,
      booking._id,
      "in_progress",
    );
    await BookingService.updateBookingStatus(
      owner._id,
      booking._id,
      "completed",
    );

    const updatedCustomer = await Customer.findById(customer._id);
    const updatedService = await Service.findById(service._id);
    assert.equal(updatedCustomer.totalVisits, 1);
    assert.equal(updatedCustomer.totalSpent, 1500);
    assert.equal(updatedCustomer.completedAppointments, 1);
    assert.equal(updatedService.analytics.completedBookings, 1);
    assert.equal(updatedService.analytics.revenue, 1500);
  });

  it("records cancellation metrics and reason", async () => {
    const booking = await createBooking();
    const cancelled = await BookingService.updateBookingStatus(
      owner._id,
      booking._id,
      "cancelled",
      { reason: "customer_request", notes: "Changed plans" },
    );
    const updatedCustomer = await Customer.findById(customer._id);
    assert.equal(cancelled.cancellationReason, "customer_request");
    assert.equal(updatedCustomer.cancelledAppointments, 1);
  });

  it("reschedules by linking a replacement booking", async () => {
    const booking = await createBooking();
    const result = await BookingService.rescheduleBooking(
      owner._id,
      booking._id,
      futureOpenTime(4, 12),
    );
    assert.equal(result.previousBooking.status, "rescheduled");
    assert.equal(
      result.booking.rescheduledFrom.toString(),
      booking._id.toString(),
    );
  });

  it("records partial and full payments", async () => {
    const booking = await createBooking();
    const partial = await BookingService.addPayment(owner._id, booking._id, {
      amount: 500,
      method: "jazzcash",
      reference: "TX-1",
    });
    const paid = await BookingService.addPayment(owner._id, booking._id, {
      amount: 1000,
      method: "cash",
    });
    assert.equal(partial.paymentStatus, "partial");
    assert.equal(paid.paymentStatus, "paid");
    assert.equal(paid.amountDue, 0);
  });

  it("rejects overpayment", async () => {
    const booking = await createBooking();
    await assert.rejects(
      () =>
        BookingService.addPayment(owner._id, booking._id, {
          amount: 1600,
          method: "cash",
        }),
      (error) => error.statusCode === 422,
    );
  });

  it("only archives cancelled or rescheduled bookings", async () => {
    const booking = await createBooking();
    await assert.rejects(
      () => BookingService.deleteBooking(owner._id, booking._id),
      (error) => error.statusCode === 409,
    );
    await BookingService.updateBookingStatus(
      owner._id,
      booking._id,
      "cancelled",
      { reason: "other" },
    );
    await BookingService.deleteBooking(owner._id, booking._id);
    const stored = await Booking.findById(booking._id);
    assert.ok(stored.deletedAt);
  });
});

describe("Booking API", () => {
  it("requires authentication", async () => {
    const response = await request(app).get("/api/v1/bookings");
    assert.equal(response.status, 401);
  });

  it("validates required booking fields", async () => {
    const response = await request(app)
      .post("/api/v1/bookings")
      .set("Authorization", `Bearer ${owner.generateAuthToken()}`)
      .send({});
    assert.equal(response.status, 422);
  });

  it("creates, lists, and captures a booking over HTTP", async () => {
    const token = owner.generateAuthToken();
    const created = await request(app)
      .post("/api/v1/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId: customer._id,
        serviceId: service._id,
        staffId: owner._id,
        scheduledAt: futureOpenTime().toISOString(),
      });
    const listed = await request(app)
      .get("/api/v1/bookings")
      .set("Authorization", `Bearer ${token}`);

    assert.equal(created.status, 201);
    assert.equal(listed.status, 200);
    assert.equal(listed.body.data.bookings.length, 1);
  });

  it("returns 422 for malformed booking IDs", async () => {
    const response = await request(app)
      .get("/api/v1/bookings/not-an-id")
      .set("Authorization", `Bearer ${owner.generateAuthToken()}`);
    assert.equal(response.status, 422);
  });
});
