import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import app from "../app.js";
import * as ServiceCatalog from "../src/services/service.service.js";
import Business from "../src/models/business/business.model.js";
import Category from "../src/models/common/categorySchema.js";
import Service from "../src/models/service.model.js";
import User from "../src/models/user.model.js";

let mongod;
let owner;
let business;

const createTenant = async (suffix) => {
  const safeSuffix = String(suffix)
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .slice(-14);
  const user = await User.create({
    email: `service-owner-${suffix}@test.com`,
    username: `service_owner_${safeSuffix}`,
    password: "Password123!",
    name: `Owner ${suffix}`,
    isEmailVerified: true,
    consentToDataProcessing: true,
    role: "owner",
  });
  const tenantBusiness = await Business.create({
    name: `Service Salon ${suffix}`,
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
    Service.deleteMany({}),
    Business.deleteMany({}),
    User.deleteMany({}),
  ]);
  ({ user: owner, business } = await createTenant(Date.now()));
});

describe("Service Catalog service", () => {
  it("creates a service scoped to the authenticated business", async () => {
    const service = await ServiceCatalog.createService(owner._id, {
      name: "Haircut",
      price: 1500,
      duration: 45,
    });

    assert.equal(service.businessId.toString(), business._id.toString());
    assert.equal(service.createdBy.toString(), owner._id.toString());
    assert.equal(service.category, "Hair");
  });

  it("rejects duplicate active service names case-insensitively", async () => {
    await ServiceCatalog.createService(owner._id, {
      name: "Haircut",
      price: 1500,
      duration: 45,
    });

    await assert.rejects(
      () =>
        ServiceCatalog.createService(owner._id, {
          name: "haircut",
          price: 2000,
          duration: 60,
        }),
      (error) => error.statusCode === 409,
    );
  });

  it("allows the same service name in another tenant", async () => {
    const other = await createTenant(`other-${Date.now()}`);
    await ServiceCatalog.createService(owner._id, {
      name: "Consultation",
      price: 1000,
      duration: 30,
    });
    const service = await ServiceCatalog.createService(other.user._id, {
      name: "Consultation",
      price: 2000,
      duration: 30,
    });

    assert.equal(service.businessId.toString(), other.business._id.toString());
  });

  it("validates assigned staff ownership", async () => {
    const other = await createTenant(`other-${Date.now()}`);

    await assert.rejects(
      () =>
        ServiceCatalog.createService(owner._id, {
          name: "Restricted",
          price: 1000,
          duration: 30,
          assignedStaff: [other.user._id],
        }),
      (error) => error.statusCode === 422,
    );
  });

  it("accepts active staff from the same business", async () => {
    const staff = await User.create({
      email: "staff-service@test.com",
      username: "staff_service",
      password: "Password123!",
      name: "Service Staff",
      isEmailVerified: true,
      consentToDataProcessing: true,
      role: "staff",
      businessId: business._id,
    });
    const service = await ServiceCatalog.createService(owner._id, {
      name: "Facial",
      price: 3000,
      duration: 60,
      assignedStaff: [staff._id],
    });

    assert.equal(service.assignedStaff.length, 1);
    assert.equal(service.canStaffPerform(staff._id), true);
  });

  it("lists, searches, filters, sorts, and paginates services", async () => {
    await ServiceCatalog.createService(owner._id, {
      name: "Basic Facial",
      price: 2500,
      duration: 45,
      category: "Facial",
    });
    await ServiceCatalog.createService(owner._id, {
      name: "Haircut",
      price: 1500,
      duration: 30,
      category: "Hair",
    });

    const result = await ServiceCatalog.listServices(owner._id, {
      search: "facial",
      category: "Facial",
      page: 1,
      limit: 1,
      sortBy: "price",
    });

    assert.equal(result.services.length, 1);
    assert.equal(result.services[0].name, "Basic Facial");
    assert.equal(result.pagination.total, 1);
  });

  it("does not expose services belonging to another tenant", async () => {
    const other = await createTenant(`other-${Date.now()}`);
    await ServiceCatalog.createService(other.user._id, {
      name: "Hidden Service",
      price: 1000,
      duration: 30,
    });

    const result = await ServiceCatalog.listServices(owner._id);
    assert.equal(result.pagination.total, 0);
  });

  it("rejects cross-tenant service access", async () => {
    const other = await createTenant(`other-${Date.now()}`);
    const hidden = await ServiceCatalog.createService(other.user._id, {
      name: "Hidden Service",
      price: 1000,
      duration: 30,
    });

    await assert.rejects(
      () => ServiceCatalog.getService(owner._id, hidden._id),
      (error) => error.statusCode === 404,
    );
  });

  it("updates only supported service fields", async () => {
    const service = await ServiceCatalog.createService(owner._id, {
      name: "Before",
      price: 1000,
      duration: 30,
    });
    const updated = await ServiceCatalog.updateService(
      owner._id,
      service._id,
      { name: "After", price: 1800, businessId: new mongoose.Types.ObjectId() },
    );

    assert.equal(updated.name, "After");
    assert.equal(updated.price, 1800);
    assert.equal(updated.businessId.toString(), business._id.toString());
  });

  it("archives a service and excludes it from default listings", async () => {
    const service = await ServiceCatalog.createService(owner._id, {
      name: "Archive Me",
      price: 1000,
      duration: 30,
    });
    await ServiceCatalog.deleteService(owner._id, service._id);

    const stored = await Service.findById(service._id);
    const list = await ServiceCatalog.listServices(owner._id);
    assert.equal(stored.isActive, false);
    assert.equal(list.pagination.total, 0);
  });

  it("allows recreating a service name after the old record is archived", async () => {
    const service = await ServiceCatalog.createService(owner._id, {
      name: "Reusable",
      price: 1000,
      duration: 30,
    });
    await ServiceCatalog.deleteService(owner._id, service._id);
    const replacement = await ServiceCatalog.createService(owner._id, {
      name: "Reusable",
      price: 1200,
      duration: 35,
    });

    assert.equal(replacement.isActive, true);
  });

  it("imports valid services and reports duplicate rows", async () => {
    await ServiceCatalog.createService(owner._id, {
      name: "Existing",
      price: 1000,
      duration: 30,
    });
    const result = await ServiceCatalog.importServices(owner._id, [
      { name: "Existing", price: 1200, duration: 30 },
      { name: "New Service", price: 2000, duration: 60 },
    ]);

    assert.equal(result.imported, 1);
    assert.equal(result.failed, 1);
  });

  it("returns useful analytics for active services", async () => {
    await ServiceCatalog.createService(owner._id, {
      name: "Service One",
      price: 1000,
      duration: 30,
      category: "General",
      isPopular: true,
    });
    await ServiceCatalog.createService(owner._id, {
      name: "Service Two",
      price: 3000,
      duration: 60,
      category: "General",
    });

    const analytics = await ServiceCatalog.getServiceAnalytics(owner._id);
    assert.equal(analytics.totalServices, 2);
    assert.equal(analytics.popularServices, 1);
    assert.equal(analytics.averagePrice, 2000);
    assert.equal(analytics.averageDuration, 45);
  });
});

describe("Service Catalog API", () => {
  it("requires authentication", async () => {
    const response = await request(app).get("/api/v1/services");
    assert.equal(response.status, 401);
  });

  it("validates required create fields", async () => {
    const response = await request(app)
      .post("/api/v1/services")
      .set("Authorization", `Bearer ${owner.generateAuthToken()}`)
      .send({ name: "Incomplete" });

    assert.equal(response.status, 422);
  });

  it("creates and lists a service over HTTP", async () => {
    const token = owner.generateAuthToken();
    const created = await request(app)
      .post("/api/v1/services")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "HTTP Facial", price: 2500, duration: 45 });
    const listed = await request(app)
      .get("/api/v1/services?search=HTTP")
      .set("Authorization", `Bearer ${token}`);

    assert.equal(created.status, 201);
    assert.equal(listed.status, 200);
    assert.equal(listed.body.data.services.length, 1);
  });

  it("returns 422 for malformed service IDs", async () => {
    const response = await request(app)
      .get("/api/v1/services/not-an-id")
      .set("Authorization", `Bearer ${owner.generateAuthToken()}`);

    assert.equal(response.status, 422);
  });
});
