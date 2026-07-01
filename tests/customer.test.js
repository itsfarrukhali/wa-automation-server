import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import app from "../app.js";
import * as CustomerService from "../src/services/customer.service.js";
import Business from "../src/models/business/business.model.js";
import Category from "../src/models/common/categorySchema.js";
import Customer from "../src/models/customer.model.js";
import User from "../src/models/user.model.js";

let mongod;
let owner;
let business;

const createTenant = async (suffix, customerLimit = 100) => {
  const safeSuffix = String(suffix).replace(/[^a-zA-Z0-9_]/g, "_");
  const user = await User.create({
    email: `owner-${suffix}@test.com`,
    username: `owner_${safeSuffix}`,
    password: "Password123!",
    name: `Owner ${suffix}`,
    isEmailVerified: true,
    consentToDataProcessing: true,
    role: "owner",
  });

  const tenantBusiness = await Business.create({
    name: `Salon ${suffix}`,
    type: "salon",
    ownerId: user._id,
    plan: {
      currentPlan: "free",
      limits: {
        monthlyMessages: 500,
        staffAccounts: 1,
        customers: customerLimit,
      },
    },
  });

  user.businessId = tenantBusiness._id;
  await user.save();

  return { user, business: tenantBusiness };
};

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
    Customer.deleteMany({}),
    Business.deleteMany({}),
    User.deleteMany({}),
  ]);
  ({ user: owner, business } = await createTenant(Date.now()));
});

describe("Customer service", () => {
  it("creates a tenant-scoped customer and normalizes Pakistani phone numbers", async () => {
    const customer = await CustomerService.createCustomer(owner._id, {
      name: "Ayesha Khan",
      phone: "03001234567",
    });

    assert.equal(customer.businessId.toString(), business._id.toString());
    assert.equal(customer.phone, "+923001234567");
    assert.equal(customer.whatsappNumber, "+923001234567");
    assert.equal(customer.source, "manual");
  });

  it("updates plan customer usage after creation", async () => {
    await CustomerService.createCustomer(owner._id, {
      name: "Ali",
      phone: "03001234567",
    });

    const updatedBusiness = await Business.findById(business._id);
    assert.equal(updatedBusiness.plan.usage.customerCount, 1);
  });

  it("rejects duplicate phone numbers inside one business", async () => {
    await CustomerService.createCustomer(owner._id, {
      name: "First",
      phone: "03001234567",
    });

    await assert.rejects(
      () =>
        CustomerService.createCustomer(owner._id, {
          name: "Second",
          phone: "+923001234567",
        }),
      (error) => error.statusCode === 409,
    );
  });

  it("allows the same phone number in different businesses", async () => {
    const other = await createTenant(`other-${Date.now()}`);
    await CustomerService.createCustomer(owner._id, {
      name: "Tenant One",
      phone: "03001234567",
    });
    const customer = await CustomerService.createCustomer(other.user._id, {
      name: "Tenant Two",
      phone: "03001234567",
    });

    assert.equal(customer.businessId.toString(), other.business._id.toString());
  });

  it("enforces the business plan customer limit", async () => {
    business.plan.limits.customers = 1;
    await business.save();
    await CustomerService.createCustomer(owner._id, {
      name: "Allowed",
      phone: "03001234567",
    });

    await assert.rejects(
      () =>
        CustomerService.createCustomer(owner._id, {
          name: "Blocked",
          phone: "03011234567",
        }),
      (error) => error.statusCode === 403,
    );
  });

  it("lists, searches, filters, and paginates customers", async () => {
    await CustomerService.createCustomer(owner._id, {
      name: "Ayesha VIP",
      phone: "03001234567",
      tags: ["vip"],
    });
    await CustomerService.createCustomer(owner._id, {
      name: "Bilal",
      phone: "03011234567",
    });

    const result = await CustomerService.listCustomers(owner._id, {
      search: "Ayesha",
      tag: "vip",
      page: 1,
      limit: 1,
    });

    assert.equal(result.customers.length, 1);
    assert.equal(result.customers[0].name, "Ayesha VIP");
    assert.equal(result.pagination.total, 1);
  });

  it("never returns customers owned by another tenant", async () => {
    const other = await createTenant(`other-${Date.now()}`);
    await CustomerService.createCustomer(other.user._id, {
      name: "Hidden",
      phone: "03001234567",
    });

    const result = await CustomerService.listCustomers(owner._id);
    assert.equal(result.pagination.total, 0);
  });

  it("rejects cross-tenant customer detail access", async () => {
    const other = await createTenant(`other-${Date.now()}`);
    const hidden = await CustomerService.createCustomer(other.user._id, {
      name: "Hidden",
      phone: "03001234567",
    });

    await assert.rejects(
      () => CustomerService.getCustomer(owner._id, hidden._id),
      (error) => error.statusCode === 404,
    );
  });

  it("updates allowed fields without allowing metric tampering", async () => {
    const customer = await CustomerService.createCustomer(owner._id, {
      name: "Before",
      phone: "03001234567",
    });
    const updated = await CustomerService.updateCustomer(
      owner._id,
      customer._id,
      { name: "After", totalSpent: 999999 },
    );

    assert.equal(updated.name, "After");
    assert.equal(updated.totalSpent, 0);
  });

  it("keeps WhatsApp opt-in and opted-out state consistent", async () => {
    const customer = await CustomerService.createCustomer(owner._id, {
      name: "Consent Test",
      phone: "03001234567",
    });
    const updated = await CustomerService.updateCustomer(
      owner._id,
      customer._id,
      { whatsappOptIn: false },
    );

    assert.equal(updated.whatsappOptIn, false);
    assert.equal(updated.optedOut, true);
  });

  it("soft deletes customers and removes them from list results", async () => {
    const customer = await CustomerService.createCustomer(owner._id, {
      name: "Delete Me",
      phone: "03001234567",
    });
    await CustomerService.deleteCustomer(owner._id, customer._id);

    const stored = await Customer.findById(customer._id);
    const list = await CustomerService.listCustomers(owner._id);
    const updatedBusiness = await Business.findById(business._id);

    assert.equal(stored.status, "deleted");
    assert.ok(stored.deletedAt);
    assert.equal(list.pagination.total, 0);
    assert.equal(updatedBusiness.plan.usage.customerCount, 0);
  });

  it("imports valid customers and reports duplicate rows", async () => {
    await CustomerService.createCustomer(owner._id, {
      name: "Existing",
      phone: "03001234567",
    });

    const result = await CustomerService.importCustomers(owner._id, [
      { name: "Duplicate", phone: "03001234567" },
      { name: "New", phone: "03011234567" },
    ]);

    assert.equal(result.imported, 1);
    assert.equal(result.failed, 1);
    assert.equal(result.errors[0].message, "Duplicate phone number");
  });

  it("returns an empty booking history for a new customer", async () => {
    const customer = await CustomerService.createCustomer(owner._id, {
      name: "No Bookings",
      phone: "03001234567",
    });
    const result = await CustomerService.getCustomerBookings(
      owner._id,
      customer._id,
    );

    assert.deepEqual(result.bookings, []);
    assert.equal(result.pagination.total, 0);
  });
});

describe("Customer API", () => {
  it("requires authentication", async () => {
    const response = await request(app).get("/api/v1/customers");
    assert.equal(response.status, 401);
  });

  it("validates required create fields", async () => {
    const response = await request(app)
      .post("/api/v1/customers")
      .set("Authorization", `Bearer ${owner.generateAuthToken()}`)
      .send({ name: "" });

    assert.equal(response.status, 422);
    assert.equal(response.body.success, false);
  });

  it("creates and lists a customer through HTTP", async () => {
    const token = owner.generateAuthToken();
    const created = await request(app)
      .post("/api/v1/customers")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "HTTP Customer", phone: "03001234567" });
    const listed = await request(app)
      .get("/api/v1/customers?search=HTTP")
      .set("Authorization", `Bearer ${token}`);

    assert.equal(created.status, 201);
    assert.equal(listed.status, 200);
    assert.equal(listed.body.data.customers.length, 1);
  });

  it("returns 422 for malformed customer IDs", async () => {
    const response = await request(app)
      .get("/api/v1/customers/not-an-id")
      .set("Authorization", `Bearer ${owner.generateAuthToken()}`);

    assert.equal(response.status, 422);
  });
});
