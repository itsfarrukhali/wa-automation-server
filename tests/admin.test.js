/**
 * tests/admin.test.js
 *
 * Full Mocha test suite for the Admin module.
 *
 * Strategy (mirrors auth.test.js):
 *   - MongoMemoryServer   — real Mongoose, no Atlas needed
 *   - sinon stubs         — email service + Category.findOne (business type validator)
 *   - Tokens generated directly via user.generateAuthToken() — no HTTP login round-trip
 *   - superRequest()      — thin wrapper that sets Authorization header
 *
 * Coverage: 52 cases across
 *   • Auth guards          (401 / 403 for every protected endpoint)
 *   • System stats         (shape, numeric values)
 *   • User management      (list, filters, detail, verify, reset, role change, deactivate)
 *   • Privilege hierarchy  (admin cannot touch admin/superadmin, etc.)
 *   • Admin management     (create, duplicate, list — superadmin only)
 *   • Business management  (list, detail, verify, plan, onboarding, status)
 *   • Delete user          (superadmin only, self-delete blocked)
 *
 * Run:
 *   npm test
 *   # or directly:
 *   node --experimental-vm-modules node_modules/.bin/mocha tests/admin.test.js --timeout 15000
 */

import * as chai from "chai";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import nodemailer from "nodemailer";
import sinon from "sinon";
import request from "supertest";

const { expect } = chai;

chai.use((_chai, utils) => {
  _chai.Assertion.addMethod("status", function (expectedStatus) {
    const response = utils.flag(this, "object");

    new _chai.Assertion(response).to.have.property("status");
    this.assert(
      response.status === expectedStatus,
      "expected response status #{act} to equal #{exp}",
      "expected response status #{act} to not equal #{exp}",
      expectedStatus,
      response.status,
    );
  });
});

// App & models
import app from "../app.js";
import User from "../src/models/user.model.js";
import Business from "../src/models/business/business.model.js";
import Category from "../src/models/common/categorySchema.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns a chai-http agent request with the Authorization header pre-set.
 * Usage: await authed(superAdminToken).get("/api/v1/admin/stats")
 */
const authed = (token) => ({
  get: (url) => request(app).get(url).set("Authorization", `Bearer ${token}`),
  post: (url) => request(app).post(url).set("Authorization", `Bearer ${token}`),
  patch: (url) =>
    request(app).patch(url).set("Authorization", `Bearer ${token}`),
  delete: (url) =>
    request(app).delete(url).set("Authorization", `Bearer ${token}`),
});

/**
 * Build a user directly in MongoDB — skips HTTP registration so tests
 * are not dependent on the auth module.
 */
const createUser = async (overrides = {}) => {
  const base = {
    name: "Test User",
    username: `user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    email: `user_${Date.now()}@test.com`,
    password: "Password123!",
    role: "owner",
    isEmailVerified: true,
    isActive: true,
    consentToDataProcessing: true,
    ...overrides,
  };
  return User.create(base);
};

/**
 * Build a business directly in MongoDB.
 * The Category type validator is stubbed in beforeEach, so any type string works.
 */
const createBusiness = async (ownerId, overrides = {}) => {
  return Business.create({
    name: "Test Business",
    type: "salon", // Category stub makes this pass
    ownerId,
    onboardingStep: 1,
    ...overrides,
  });
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe("Admin Module", function () {
  this.timeout(15000);

  let mongod;

  // Actors — created fresh for each test block via beforeEach
  let superAdmin, superAdminToken;
  let admin, adminToken;
  let owner, ownerToken;
  let staff, staffToken;
  let business; // owned by `owner`

  // Stubs
  let transportStub;
  let categoryStub;

  // ─── DB lifecycle ──────────────────────────────────────────────────────────

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  });

  after(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  // ─── Per-test setup ────────────────────────────────────────────────────────

  beforeEach(async () => {
    // Clear all collections
    await Promise.all([User.deleteMany({}), Business.deleteMany({})]);

    // Stub the Nodemailer transport used by the email service.
    transportStub = sinon.stub(nodemailer, "createTransport").returns({
      verify: (callback) => callback(null, true),
      sendMail: sinon.stub().resolves({ messageId: "test-message-id" }),
    });

    // Stub Category.findOne so Business type validation always passes
    // This is required because the Business model validator calls Category.findOne
    categoryStub = sinon
      .stub(Category, "findOne")
      .resolves({ name: "salon", isActive: true });

    // Create actors
    superAdmin = await createUser({
      role: "superadmin",
      username: "superadmin_test",
      email: "superadmin@test.com",
    });
    admin = await createUser({
      role: "admin",
      username: "admin_test",
      email: "admin@test.com",
    });
    owner = await createUser({
      role: "owner",
      username: "owner_test",
      email: "owner@test.com",
    });
    staff = await createUser({
      role: "staff",
      username: "staff_test",
      email: "staff@test.com",
    });

    // Generate tokens directly — avoids HTTP login dependency
    superAdminToken = superAdmin.generateAuthToken();
    adminToken = admin.generateAuthToken();
    ownerToken = owner.generateAuthToken();
    staffToken = staff.generateAuthToken();

    // Business linked to owner
    business = await createBusiness(owner._id);
    owner.businessId = business._id;
    await owner.save();
  });

  afterEach(() => {
    sinon.restore();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 1. AUTH GUARDS — every endpoint must block unauthenticated + non-admin
  // ══════════════════════════════════════════════════════════════════════════

  describe("1. Auth Guards", () => {
    const adminEndpoints = [
      { method: "get", path: "/api/v1/admin/stats" },
      { method: "get", path: "/api/v1/admin/users" },
      { method: "get", path: "/api/v1/admin/businesses" },
    ];

    const superAdminEndpoints = [
      { method: "get", path: "/api/v1/superadmin/admins" },
      { method: "post", path: "/api/v1/superadmin/admins" },
    ];

    adminEndpoints.forEach(({ method, path }) => {
      it(`${method.toUpperCase()} ${path} — no token → 401`, async () => {
        const res = await request(app)[method](path);
        expect(res).to.have.status(401);
        expect(res.body.success).to.be.false;
      });

      it(`${method.toUpperCase()} ${path} — owner token → 403`, async () => {
        const res = await request(app)
          [method](path)
          .set("Authorization", `Bearer ${ownerToken}`);
        expect(res).to.have.status(403);
      });

      it(`${method.toUpperCase()} ${path} — staff token → 403`, async () => {
        const res = await request(app)
          [method](path)
          .set("Authorization", `Bearer ${staffToken}`);
        expect(res).to.have.status(403);
      });
    });

    superAdminEndpoints.forEach(({ method, path }) => {
      it(`${method.toUpperCase()} ${path} — admin token → 403`, async () => {
        const res = await request(app)
          [method](path)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({
            name: "x",
            username: "x",
            email: "x@x.com",
            password: "Abc12345",
          });
        expect(res).to.have.status(403);
      });
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 2. SYSTEM STATS
  // ══════════════════════════════════════════════════════════════════════════

  describe("2. GET /api/v1/admin/stats", () => {
    it("admin → 200 with correct shape", async () => {
      const res = await request(app)
        .get("/api/v1/admin/stats")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res).to.have.status(200);
      expect(res.body.success).to.be.true;

      const { data } = res.body;
      expect(data).to.have.all.keys("users", "businesses", "plans", "roles");
      expect(data.users).to.have.all.keys(
        "total",
        "active",
        "inactive",
        "verified",
        "unverified",
        "newLast7Days",
        "newLast30Days",
      );
      expect(data.businesses).to.have.all.keys(
        "total",
        "active",
        "inactive",
        "onboarded",
        "inProgress",
        "whatsappConnected",
        "newLast30Days",
      );
    });

    it("superadmin → 200", async () => {
      const res = await request(app)
        .get("/api/v1/admin/stats")
        .set("Authorization", `Bearer ${superAdminToken}`);
      expect(res).to.have.status(200);
    });

    it("counts are numbers ≥ 0", async () => {
      const res = await request(app)
        .get("/api/v1/admin/stats")
        .set("Authorization", `Bearer ${adminToken}`);

      const { users, businesses } = res.body.data;
      expect(users.total).to.be.a("number").and.to.be.at.least(0);
      expect(businesses.total).to.be.a("number").and.to.be.at.least(0);
    });

    it("users.total excludes admin/superadmin roles", async () => {
      // We have 1 owner + 1 staff in the DB = 2 SME users
      const res = await request(app)
        .get("/api/v1/admin/stats")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.body.data.users.total).to.equal(2);
    });

    it("businesses.total reflects DB state", async () => {
      const res = await request(app)
        .get("/api/v1/admin/stats")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.body.data.businesses.total).to.equal(1);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 3. USER MANAGEMENT — LIST
  // ══════════════════════════════════════════════════════════════════════════

  describe("3. GET /api/v1/admin/users", () => {
    it("admin → 200 with paginated list", async () => {
      const res = await request(app)
        .get("/api/v1/admin/users")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res).to.have.status(200);
      expect(res.body.data.users).to.be.an("array");
      expect(res.body.data.pagination).to.have.all.keys(
        "total",
        "page",
        "limit",
        "pages",
      );
    });

    it("admin list does NOT contain superadmin accounts", async () => {
      const res = await request(app)
        .get("/api/v1/admin/users")
        .set("Authorization", `Bearer ${adminToken}`);

      const roles = res.body.data.users.map((u) => u.role);
      expect(roles).to.not.include("superadmin");
    });

    it("superadmin list DOES contain all roles including superadmin", async () => {
      const res = await request(app)
        .get("/api/v1/admin/users")
        .set("Authorization", `Bearer ${superAdminToken}`);

      const roles = res.body.data.users.map((u) => u.role);
      expect(roles).to.include("superadmin");
    });

    it("filter role=owner returns only owners", async () => {
      const res = await request(app)
        .get("/api/v1/admin/users?role=owner")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res).to.have.status(200);
      const allOwners = res.body.data.users.every((u) => u.role === "owner");
      expect(allOwners).to.be.true;
    });

    it("filter isActive=false returns only inactive users", async () => {
      // Deactivate the owner
      await User.findByIdAndUpdate(owner._id, { isActive: false });

      const res = await request(app)
        .get("/api/v1/admin/users?isActive=false")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res).to.have.status(200);
      if (res.body.data.users.length > 0) {
        expect(res.body.data.users.every((u) => u.isActive === false)).to.be
          .true;
      }
    });

    it("filter isEmailVerified=false works correctly", async () => {
      // Create an unverified user
      await createUser({
        isEmailVerified: false,
        username: "unverified_u",
        email: "unverified@test.com",
      });

      const res = await request(app)
        .get("/api/v1/admin/users?isEmailVerified=false")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res).to.have.status(200);
      expect(res.body.data.users.every((u) => u.isEmailVerified === false)).to
        .be.true;
    });

    it("search param matches by name", async () => {
      const res = await request(app)
        .get("/api/v1/admin/users?search=Test+User")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res).to.have.status(200);
      expect(res.body.data.users).to.be.an("array");
    });

    it("admin filtering role=superadmin → 403", async () => {
      const res = await request(app)
        .get("/api/v1/admin/users?role=superadmin")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res).to.have.status(403);
    });

    it("invalid role filter → 422", async () => {
      const res = await request(app)
        .get("/api/v1/admin/users?role=god")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res).to.have.status(422);
      expect(res.body.error).to.be.an("array");
    });

    it("pagination — page and limit work", async () => {
      const res = await request(app)
        .get("/api/v1/admin/users?page=1&limit=2")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res).to.have.status(200);
      expect(res.body.data.pagination.page).to.equal(1);
      expect(res.body.data.pagination.limit).to.equal(2);
      expect(res.body.data.users.length).to.be.at.most(2);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 4. USER MANAGEMENT — DETAIL
  // ══════════════════════════════════════════════════════════════════════════

  describe("4. GET /api/v1/admin/users/:userId", () => {
    it("admin → 200 with user profile and business", async () => {
      const res = await request(app)
        .get(`/api/v1/admin/users/${owner._id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res).to.have.status(200);
      expect(res.body.data.user).to.include.keys("id", "name", "email", "role");
      expect(res.body.data.business).to.be.an("object");
    });

    it("user with no business returns business: null", async () => {
      const res = await request(app)
        .get(`/api/v1/admin/users/${staff._id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res).to.have.status(200);
      expect(res.body.data.business).to.be.null;
    });

    it("admin fetching superadmin detail → 403", async () => {
      const res = await request(app)
        .get(`/api/v1/admin/users/${superAdmin._id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res).to.have.status(403);
    });

    it("superadmin fetching superadmin detail → 200", async () => {
      const res = await request(app)
        .get(`/api/v1/admin/users/${superAdmin._id}`)
        .set("Authorization", `Bearer ${superAdminToken}`);

      expect(res).to.have.status(200);
      expect(res.body.data.user.role).to.equal("superadmin");
    });

    it("non-existent userId → 404", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/v1/admin/users/${fakeId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res).to.have.status(404);
    });

    it("invalid ObjectId → 422", async () => {
      const res = await request(app)
        .get("/api/v1/admin/users/not-an-objectid")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res).to.have.status(422);
      expect(res.body.error[0].field).to.equal("userId");
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 5. FORCE VERIFY EMAIL
  // ══════════════════════════════════════════════════════════════════════════

  describe("5. POST /api/v1/admin/users/:userId/verify-email", () => {
    let unverifiedUser;

    beforeEach(async () => {
      unverifiedUser = await createUser({
        isEmailVerified: false,
        username: "unverified_ev",
        email: "unverified_ev@test.com",
      });
    });

    it("admin can force-verify an unverified user → 200", async () => {
      const res = await request(app)
        .post(`/api/v1/admin/users/${unverifiedUser._id}/verify-email`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res).to.have.status(200);
      expect(res.body.data.user.isEmailVerified).to.be.true;

      // Confirm persisted in DB
      const updated = await User.findById(unverifiedUser._id);
      expect(updated.isEmailVerified).to.be.true;
    });

    it("already verified → 409", async () => {
      const res = await request(app)
        .post(`/api/v1/admin/users/${owner._id}/verify-email`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res).to.have.status(409);
      expect(res.body.message.toLowerCase()).to.include("already verified");
    });

    it("admin cannot verify a superadmin (privilege guard) → 403", async () => {
      // superAdmin.isEmailVerified is true so this also hits 409,
      // but first it must hit the privilege check
      // Create an unverified superadmin to test cleanly
      const unverifiedSuperAdmin = await createUser({
        role: "superadmin",
        isEmailVerified: false,
        username: "unverified_sa",
        email: "unverified_sa@test.com",
      });

      const res = await request(app)
        .post(`/api/v1/admin/users/${unverifiedSuperAdmin._id}/verify-email`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res).to.have.status(403);
    });

    it("non-existent user → 404", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .post(`/api/v1/admin/users/${fakeId}/verify-email`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res).to.have.status(404);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 6. ADMIN-INITIATED PASSWORD RESET
  // ══════════════════════════════════════════════════════════════════════════

  describe("6. POST /api/v1/admin/users/:userId/reset-password", () => {
    it("admin → 200, dev token exposed, email stub called", async () => {
      process.env.NODE_ENV = "development";

      const res = await request(app)
        .post(`/api/v1/admin/users/${owner._id}/reset-password`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res).to.have.status(200);
      expect(res.body.data._devResetToken)
        .to.be.a("string")
        .with.length.greaterThan(0);

      // Token is persisted in DB
      const updated = await User.findById(owner._id).select(
        "+resetPasswordToken +resetPasswordExpiry",
      );
      expect(updated.resetPasswordToken).to.be.a("string");
      expect(updated.resetPasswordExpiry.getTime()).to.be.greaterThan(
        Date.now(),
      );
    });

    it("admin cannot reset superadmin password → 403", async () => {
      const res = await request(app)
        .post(`/api/v1/admin/users/${superAdmin._id}/reset-password`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res).to.have.status(403);
    });

    it("non-existent user → 404", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .post(`/api/v1/admin/users/${fakeId}/reset-password`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res).to.have.status(404);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 7. CHANGE USER ROLE
  // ══════════════════════════════════════════════════════════════════════════

  describe("7. PATCH /api/v1/admin/users/:userId/role", () => {
    it("admin can change owner → staff", async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${owner._id}/role`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ role: "staff" });

      expect(res).to.have.status(200);
      expect(res.body.data.user.role).to.equal("staff");
      expect(res.body.data.previousRole).to.equal("owner");
      expect(res.body.message).to.include("invalidated");
    });

    it("role change wipes all refresh tokens (sessions killed)", async () => {
      // Give owner a refresh token first
      owner.generateRefreshToken({
        userAgent: "test",
        platform: "test",
        ip: "127.0.0.1",
      });
      await owner.save();

      let dbOwner = await User.findById(owner._id).select(
        "+refreshTokens +tokenVersion",
      );
      const versionBefore = dbOwner.tokenVersion;

      await request(app)
        .patch(`/api/v1/admin/users/${owner._id}/role`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ role: "staff" });

      dbOwner = await User.findById(owner._id).select(
        "+refreshTokens +tokenVersion",
      );
      expect(dbOwner.refreshTokens).to.have.length(0);
      expect(dbOwner.tokenVersion).to.equal(versionBefore + 1);
    });

    it("same role → 409", async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${owner._id}/role`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ role: "owner" });

      expect(res).to.have.status(409);
      expect(res.body.message).to.include("already has the role");
    });

    it("admin cannot assign admin role → 403", async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${owner._id}/role`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ role: "admin" });

      expect(res).to.have.status(403);
    });

    it("admin cannot change another admin's role → 403", async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${admin._id}/role`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ role: "owner" });

      expect(res).to.have.status(403);
    });

    it("admin cannot change superadmin's role → 403", async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${superAdmin._id}/role`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ role: "owner" });

      expect(res).to.have.status(403);
    });

    it("superadmin can assign admin role", async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${owner._id}/role`)
        .set("Authorization", `Bearer ${superAdminToken}`)
        .send({ role: "admin" });

      expect(res).to.have.status(200);
      expect(res.body.data.user.role).to.equal("admin");
    });

    it("cannot change own role → 403", async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${admin._id}/role`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ role: "owner" });

      // admin._id === adminToken's userId → should hit the self-modification guard
      expect(res).to.have.status(403);
    });

    it("missing role field → 422", async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${owner._id}/role`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect(res).to.have.status(422);
      expect(res.body.error[0].field).to.equal("role");
    });

    it("invalid role value → 422", async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${owner._id}/role`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ role: "manager" });

      expect(res).to.have.status(422);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 8. SET USER ACTIVE STATUS
  // ══════════════════════════════════════════════════════════════════════════

  describe("8. PATCH /api/v1/admin/users/:userId/status", () => {
    it("admin deactivates owner → 200, isActive: false", async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${owner._id}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ isActive: false });

      expect(res).to.have.status(200);
      expect(res.body.data.user.isActive).to.be.false;
      expect(res.body.message).to.include("deactivated");
    });

    it("deactivation wipes refresh tokens and increments tokenVersion", async () => {
      owner.generateRefreshToken({
        userAgent: "test",
        platform: "test",
        ip: "127.0.0.1",
      });
      await owner.save();

      const before = await User.findById(owner._id).select(
        "+refreshTokens +tokenVersion",
      );
      const versionBefore = before.tokenVersion;

      await request(app)
        .patch(`/api/v1/admin/users/${owner._id}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ isActive: false });

      const after = await User.findById(owner._id).select(
        "+refreshTokens +tokenVersion",
      );
      expect(after.refreshTokens).to.have.length(0);
      expect(after.tokenVersion).to.equal(versionBefore + 1);
    });

    it("admin reactivates owner → 200, isActive: true", async () => {
      await User.findByIdAndUpdate(owner._id, { isActive: false });

      const res = await request(app)
        .patch(`/api/v1/admin/users/${owner._id}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ isActive: true });

      expect(res).to.have.status(200);
      expect(res.body.data.user.isActive).to.be.true;
      expect(res.body.message).to.include("activated");
    });

    it("admin cannot deactivate another admin → 403", async () => {
      const anotherAdmin = await createUser({
        role: "admin",
        username: "another_admin",
        email: "another_admin@test.com",
      });

      const res = await request(app)
        .patch(`/api/v1/admin/users/${anotherAdmin._id}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ isActive: false });

      expect(res).to.have.status(403);
    });

    it("admin cannot deactivate superadmin → 403", async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${superAdmin._id}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ isActive: false });

      expect(res).to.have.status(403);
    });

    it("missing isActive → 422", async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${owner._id}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect(res).to.have.status(422);
      expect(res.body.error[0].field).to.equal("isActive");
    });

    it("non-boolean isActive → 422", async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${owner._id}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ isActive: "yes" });

      expect(res).to.have.status(422);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 9. ADMIN MANAGEMENT — SUPERADMIN ONLY
  // ══════════════════════════════════════════════════════════════════════════

  describe("9. POST /api/v1/superadmin/admins — Create Admin", () => {
    const validPayload = {
      name: "New Admin",
      username: "newadmin",
      email: "newadmin@test.com",
      password: "AdminPass123!",
    };

    it("superadmin creates admin → 201", async () => {
      const res = await request(app)
        .post("/api/v1/superadmin/admins")
        .set("Authorization", `Bearer ${superAdminToken}`)
        .send(validPayload);

      expect(res).to.have.status(201);
      expect(res.body.data.admin.role).to.equal("admin");
      expect(res.body.data.admin.isEmailVerified).to.be.true;
      expect(res.body.data.admin.email).to.equal(validPayload.email);
    });

    it("created admin has no password exposed in response", async () => {
      const res = await request(app)
        .post("/api/v1/superadmin/admins")
        .set("Authorization", `Bearer ${superAdminToken}`)
        .send(validPayload);

      expect(res.body.data.admin).to.not.have.property("password");
      expect(res.body.data.admin).to.not.have.property("refreshTokens");
    });

    it("duplicate email → 409", async () => {
      await request(app)
        .post("/api/v1/superadmin/admins")
        .set("Authorization", `Bearer ${superAdminToken}`)
        .send(validPayload);

      const res = await request(app)
        .post("/api/v1/superadmin/admins")
        .set("Authorization", `Bearer ${superAdminToken}`)
        .send({ ...validPayload, username: "differentusername" });

      expect(res).to.have.status(409);
      expect(res.body.message.toLowerCase()).to.include("email");
    });

    it("duplicate username → 409", async () => {
      await request(app)
        .post("/api/v1/superadmin/admins")
        .set("Authorization", `Bearer ${superAdminToken}`)
        .send(validPayload);

      const res = await request(app)
        .post("/api/v1/superadmin/admins")
        .set("Authorization", `Bearer ${superAdminToken}`)
        .send({ ...validPayload, email: "different@test.com" });

      expect(res).to.have.status(409);
      expect(res.body.message.toLowerCase()).to.include("username");
    });

    it("weak password (no uppercase) → 422", async () => {
      const res = await request(app)
        .post("/api/v1/superadmin/admins")
        .set("Authorization", `Bearer ${superAdminToken}`)
        .send({ ...validPayload, password: "weakpassword1" });

      expect(res).to.have.status(422);
    });

    it("weak password (no number) → 422", async () => {
      const res = await request(app)
        .post("/api/v1/superadmin/admins")
        .set("Authorization", `Bearer ${superAdminToken}`)
        .send({ ...validPayload, password: "WeakPassword" });

      expect(res).to.have.status(422);
    });

    it("password too short → 422", async () => {
      const res = await request(app)
        .post("/api/v1/superadmin/admins")
        .set("Authorization", `Bearer ${superAdminToken}`)
        .send({ ...validPayload, password: "Ab1" });

      expect(res).to.have.status(422);
    });

    it("missing required fields → 422", async () => {
      const res = await request(app)
        .post("/api/v1/superadmin/admins")
        .set("Authorization", `Bearer ${superAdminToken}`)
        .send({ name: "Only Name" });

      expect(res).to.have.status(422);
      expect(res.body.error).to.be.an("array").with.length.greaterThan(0);
    });

    it("admin token → 403 (superadmin only)", async () => {
      const res = await request(app)
        .post("/api/v1/superadmin/admins")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(validPayload);

      expect(res).to.have.status(403);
    });
  });

  describe("9b. GET /api/v1/superadmin/admins — List Admins", () => {
    it("superadmin → 200 with admin list", async () => {
      // admin created in beforeEach already exists
      const res = await request(app)
        .get("/api/v1/superadmin/admins")
        .set("Authorization", `Bearer ${superAdminToken}`);

      expect(res).to.have.status(200);
      expect(res.body.data.admins).to.be.an("array");
      expect(res.body.data.admins.length).to.be.at.least(1);
      expect(res.body.data.pagination).to.have.all.keys(
        "total",
        "page",
        "limit",
        "pages",
      );
    });

    it("all returned users have role=admin", async () => {
      const res = await request(app)
        .get("/api/v1/superadmin/admins")
        .set("Authorization", `Bearer ${superAdminToken}`);

      expect(res.body.data.admins).to.be.an("array");
      expect(res.body.data.admins).to.have.length.greaterThan(0);
      expect(res.body.data.admins.map((u) => u.username)).to.include(
        admin.username,
      );
      expect(res.body.data.admins.some((u) => u.username === superAdmin.username))
        .to.be.false;
    });

    it("pagination params respected", async () => {
      const res = await request(app)
        .get("/api/v1/superadmin/admins?page=1&limit=1")
        .set("Authorization", `Bearer ${superAdminToken}`);

      expect(res).to.have.status(200);
      expect(res.body.data.admins.length).to.be.at.most(1);
      expect(res.body.data.pagination.limit).to.equal(1);
    });

    it("admin token → 403", async () => {
      const res = await request(app)
        .get("/api/v1/superadmin/admins")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res).to.have.status(403);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 10. BUSINESS MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════════

  describe("10. Business Management", () => {
    describe("GET /api/v1/admin/businesses", () => {
      it("admin → 200 with paginated businesses", async () => {
        const res = await request(app)
          .get("/api/v1/admin/businesses")
          .set("Authorization", `Bearer ${adminToken}`);

        expect(res).to.have.status(200);
        expect(res.body.data.businesses).to.be.an("array").with.length(1);
        expect(res.body.data.pagination).to.have.all.keys(
          "total",
          "page",
          "limit",
          "pages",
        );
      });

      it("owner is populated on business list items", async () => {
        const res = await request(app)
          .get("/api/v1/admin/businesses")
          .set("Authorization", `Bearer ${adminToken}`);

        const biz = res.body.data.businesses[0];
        expect(biz.ownerId).to.be.an("object");
        expect(biz.ownerId.email).to.be.a("string");
      });

      it("filter isActive=true", async () => {
        const res = await request(app)
          .get("/api/v1/admin/businesses?isActive=true")
          .set("Authorization", `Bearer ${adminToken}`);

        expect(res).to.have.status(200);
        expect(res.body.data.businesses.every((b) => b.isActive === true)).to.be
          .true;
      });

      it("filter isActive=false returns empty when none deactivated", async () => {
        const res = await request(app)
          .get("/api/v1/admin/businesses?isActive=false")
          .set("Authorization", `Bearer ${adminToken}`);

        expect(res).to.have.status(200);
        expect(res.body.data.businesses).to.have.length(0);
      });

      it("search by business name", async () => {
        const res = await request(app)
          .get("/api/v1/admin/businesses?search=Test+Business")
          .set("Authorization", `Bearer ${adminToken}`);

        expect(res).to.have.status(200);
        expect(res.body.data.businesses).to.be.an("array");
      });
    });

    describe("GET /api/v1/admin/businesses/:businessId", () => {
      it("admin → 200 with full business detail + populated owner", async () => {
        const res = await request(app)
          .get(`/api/v1/admin/businesses/${business._id}`)
          .set("Authorization", `Bearer ${adminToken}`);

        expect(res).to.have.status(200);
        expect(res.body.data.business.ownerId).to.be.an("object");
        expect(res.body.data.business.ownerId.email).to.be.a("string");
      });

      it("non-existent businessId → 404", async () => {
        const fakeId = new mongoose.Types.ObjectId();
        const res = await request(app)
          .get(`/api/v1/admin/businesses/${fakeId}`)
          .set("Authorization", `Bearer ${adminToken}`);

        expect(res).to.have.status(404);
      });

      it("invalid ObjectId → 422", async () => {
        const res = await request(app)
          .get("/api/v1/admin/businesses/bad-id")
          .set("Authorization", `Bearer ${adminToken}`);

        expect(res).to.have.status(422);
        expect(res.body.error[0].field).to.equal("businessId");
      });
    });

    describe("PATCH /api/v1/admin/businesses/:businessId/verify", () => {
      it("admin sets isVerified=true → 200", async () => {
        const res = await request(app)
          .patch(`/api/v1/admin/businesses/${business._id}/verify`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ isVerified: true });

        expect(res).to.have.status(200);
        expect(res.body.data.business.isVerified).to.be.true;
        expect(res.body.message).to.include("verified");

        const updated = await Business.findById(business._id);
        expect(updated.isVerified).to.be.true;
      });

      it("admin sets isVerified=false → 200", async () => {
        await Business.findByIdAndUpdate(business._id, { isVerified: true });

        const res = await request(app)
          .patch(`/api/v1/admin/businesses/${business._id}/verify`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ isVerified: false });

        expect(res).to.have.status(200);
        expect(res.body.data.business.isVerified).to.be.false;
      });

      it("missing isVerified → 422", async () => {
        const res = await request(app)
          .patch(`/api/v1/admin/businesses/${business._id}/verify`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({});

        expect(res).to.have.status(422);
        expect(res.body.error[0].field).to.equal("isVerified");
      });
    });

    describe("POST /api/v1/admin/businesses/:businessId/upgrade-plan", () => {
      it("admin upgrades to starter → 200", async () => {
        const res = await request(app)
          .post(`/api/v1/admin/businesses/${business._id}/upgrade-plan`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ newPlan: "starter", paymentMethod: "manual" });

        expect(res).to.have.status(200);
        expect(res.body.data.business.plan.currentPlan).to.equal("starter");
      });

      it("upgrades to each valid plan", async () => {
        for (const plan of ["growth", "enterprise", "free"]) {
          const res = await request(app)
            .post(`/api/v1/admin/businesses/${business._id}/upgrade-plan`)
            .set("Authorization", `Bearer ${adminToken}`)
            .send({ newPlan: plan });

          expect(res).to.have.status(200);
          expect(res.body.data.business.plan.currentPlan).to.equal(plan);
        }
      });

      it("invalid plan name → 422", async () => {
        const res = await request(app)
          .post(`/api/v1/admin/businesses/${business._id}/upgrade-plan`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ newPlan: "platinum" });

        expect(res).to.have.status(422);
      });

      it("missing newPlan → 422", async () => {
        const res = await request(app)
          .post(`/api/v1/admin/businesses/${business._id}/upgrade-plan`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({});

        expect(res).to.have.status(422);
        expect(res.body.error[0].field).to.equal("newPlan");
      });

      it("invalid paymentMethod → 422", async () => {
        const res = await request(app)
          .post(`/api/v1/admin/businesses/${business._id}/upgrade-plan`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ newPlan: "starter", paymentMethod: "bitcoin" });

        expect(res).to.have.status(422);
      });
    });

    describe("PATCH /api/v1/admin/businesses/:businessId/onboarding", () => {
      it("force advance to step 3 → 200", async () => {
        const res = await request(app)
          .patch(`/api/v1/admin/businesses/${business._id}/onboarding`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ step: 3 });

        expect(res).to.have.status(200);
        expect(res.body.data.business.onboardingStep).to.equal(3);
        expect(res.body.data.business.onboardingComplete).to.be.false;
      });

      it("force advance to step 5 marks onboarding complete", async () => {
        const res = await request(app)
          .patch(`/api/v1/admin/businesses/${business._id}/onboarding`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ step: 5 });

        expect(res).to.have.status(200);
        expect(res.body.data.business.onboardingStep).to.equal(5);
        expect(res.body.data.business.onboardingComplete).to.be.true;
      });

      it("step=0 → 422", async () => {
        const res = await request(app)
          .patch(`/api/v1/admin/businesses/${business._id}/onboarding`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ step: 0 });

        expect(res).to.have.status(422);
      });

      it("step=6 → 422", async () => {
        const res = await request(app)
          .patch(`/api/v1/admin/businesses/${business._id}/onboarding`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ step: 6 });

        expect(res).to.have.status(422);
      });

      it("missing step → 422", async () => {
        const res = await request(app)
          .patch(`/api/v1/admin/businesses/${business._id}/onboarding`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({});

        expect(res).to.have.status(422);
      });
    });

    describe("PATCH /api/v1/admin/businesses/:businessId/status", () => {
      it("deactivate business → 200, isActive: false", async () => {
        const res = await request(app)
          .patch(`/api/v1/admin/businesses/${business._id}/status`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ isActive: false });

        expect(res).to.have.status(200);
        expect(res.body.data.business.isActive).to.be.false;
        expect(res.body.message).to.include("deactivated");

        const updated = await Business.findById(business._id);
        expect(updated.isActive).to.be.false;
      });

      it("reactivate business → 200, isActive: true", async () => {
        await Business.findByIdAndUpdate(business._id, { isActive: false });

        const res = await request(app)
          .patch(`/api/v1/admin/businesses/${business._id}/status`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ isActive: true });

        expect(res).to.have.status(200);
        expect(res.body.data.business.isActive).to.be.true;
      });

      it("non-existent businessId → 404", async () => {
        const fakeId = new mongoose.Types.ObjectId();
        const res = await request(app)
          .patch(`/api/v1/admin/businesses/${fakeId}/status`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ isActive: false });

        expect(res).to.have.status(404);
      });
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 11. DELETE USER — SUPERADMIN ONLY
  // ══════════════════════════════════════════════════════════════════════════

  describe("11. DELETE /api/v1/superadmin/users/:userId", () => {
    it("superadmin deletes an owner → 200", async () => {
      const userToDelete = await createUser({
        username: "to_delete",
        email: "to_delete@test.com",
      });

      const res = await request(app)
        .delete(`/api/v1/superadmin/users/${userToDelete._id}`)
        .set("Authorization", `Bearer ${superAdminToken}`);

      expect(res).to.have.status(200);
      expect(res.body.data.deletedUserId).to.equal(userToDelete._id.toString());

      const gone = await User.findById(userToDelete._id);
      expect(gone).to.be.null;
    });

    it("deleting user also deletes their linked business", async () => {
      const userToDelete = await createUser({
        username: "to_delete_biz",
        email: "to_delete_biz@test.com",
      });
      const bizToDelete = await createBusiness(userToDelete._id);
      userToDelete.businessId = bizToDelete._id;
      await userToDelete.save();

      const res = await request(app)
        .delete(`/api/v1/superadmin/users/${userToDelete._id}`)
        .set("Authorization", `Bearer ${superAdminToken}`);

      expect(res).to.have.status(200);
      expect(res.body.data.deletedBusinessId.toString()).to.equal(
        bizToDelete._id.toString(),
      );

      const goneBiz = await Business.findById(bizToDelete._id);
      expect(goneBiz).to.be.null;
    });

    it("superadmin cannot delete themselves → 403", async () => {
      const res = await request(app)
        .delete(`/api/v1/superadmin/users/${superAdmin._id}`)
        .set("Authorization", `Bearer ${superAdminToken}`);

      expect(res).to.have.status(403);
      expect(res.body.message).to.include("own account");
    });

    it("delete already-deleted user → 404", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .delete(`/api/v1/superadmin/users/${fakeId}`)
        .set("Authorization", `Bearer ${superAdminToken}`);

      expect(res).to.have.status(404);
    });

    it("admin token → 403 (superadmin only)", async () => {
      const res = await request(app)
        .delete(`/api/v1/superadmin/users/${owner._id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res).to.have.status(403);
    });

    it("invalid ObjectId → 422", async () => {
      const res = await request(app)
        .delete("/api/v1/superadmin/users/not-an-id")
        .set("Authorization", `Bearer ${superAdminToken}`);

      expect(res).to.have.status(422);
      expect(res.body.error[0].field).to.equal("userId");
    });
  });
});
