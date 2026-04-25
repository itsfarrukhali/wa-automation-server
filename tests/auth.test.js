/**
 * tests/auth.test.js
 *
 * Mocha + Chai + Supertest test suite for the full auth layer.
 *
 * Setup:
 *   npm install --save-dev mocha chai supertest sinon mongodb-memory-server
 *
 * Run:
 *   npm test
 *   npm run test:watch   (add --watch flag)
 *
 * package.json scripts:
 *   "test": "mocha --experimental-vm-modules tests/auth.test.js --timeout 15000 --exit",
 *   "test:watch": "mocha --experimental-vm-modules tests/auth.test.js --timeout 15000 --watch"
 *
 * The suite uses MongoMemoryServer so no real MongoDB connection is needed.
 * Email service is stubbed — no real emails sent during tests.
 */

import { use, expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Category from "../src/models/common/categorySchema.js";

use(chaiAsPromised);

let app;
let mongod;

// Test data

const BASE = "/api/v1/auth";

const seedReferenceData = async () => {
  await Category.findOneAndUpdate(
    { name: "salon" },
    {
      $set: {
        name: "salon",
        displayName: "Salon / Beauty Parlor",
        isActive: true,
      },
    },
    { upsert: true, new: true },
  );
};

const validUser = {
  email: "test.user@example.com",
  username: "testuser",
  password: "Test1234!",
  name: "Test User",
  consentToDataProcessing: true,
  businessName: "Test Salon",
  businessType: "salon",
};

const validUser2 = {
  email: "second.user@example.com",
  username: "seconduser",
  password: "Test1234!",
  name: "Second User",
  consentToDataProcessing: true,
  businessName: "Second Salon",
  businessType: "salon",
};

// Helpers

/**
 * Register and return { accessToken, refreshToken cookie, user }
 */
const registerAndLogin = async (userData = validUser) => {
  const regRes = await request(app).post(`${BASE}/register`).send(userData);

  expect(regRes.status).to.equal(201);

  const accessToken = regRes.body.data.accessToken;
  const devToken = regRes.body.data._devVerificationToken;
  const setCookieHeader = regRes.headers["set-cookie"];

  // Verify email so login works
  await request(app).get(`${BASE}/verify-email/${devToken}`);

  const loginRes = await request(app)
    .post(`${BASE}/login`)
    .send({ email: userData.email, password: userData.password });

  const loginCookie = loginRes.headers["set-cookie"];

  return {
    accessToken: loginRes.body.data.accessToken,
    cookieHeader: loginCookie,
    user: loginRes.body.data.user,
    devVerificationToken: devToken,
  };
};

// Suite

before(async () => {
  // Start in-memory MongoDB
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  // Set required env vars before importing app
  process.env.NODE_ENV = "development";
  process.env.JWT_ACCESS_SECRET = "test_jwt_access_secret_for_ci_only";
  process.env.JWT_REFRESH_SECRET = "test_jwt_refresh_secret_for_ci_only";
  process.env.JWT_EXPIRES_IN = "15m";
  process.env.REFRESH_TOKEN_EXPIRY_DAYS = "7";
  process.env.CLIENT_URL = "http://localhost:5173";
  process.env.GMAIL_USER = "noreply@example.com";
  process.env.GMAIL_APP_PASSWORD = "fake-app-password";
  process.env.MONGODB_URI = process.env.MONGODB_URI || "mongodb://test";
  process.env.WA_TOKEN = "test_wa_token";
  process.env.WA_PHONE_ID = "test_phone_id";
  process.env.WEBHOOK_VERIFY_TOKEN = "test_webhook_verify_token";
  process.env.WHATSAPP_ENCRYPTION_KEY = "test_encryption_key";

  // Import the Express app after env is set.
  // Do not import server.js in tests because it starts the HTTP listener.
  const mod = await import("../app.js");
  app = mod.default;

  await seedReferenceData();
});

after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  // Clean DB between tests so each test is isolated
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    if (key === "categories") continue;
    await collections[key].deleteMany({});
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /register
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/v1/auth/register", () => {
  it("201 — registers a new user and returns accessToken + user profile", async () => {
    const res = await request(app).post(`${BASE}/register`).send(validUser);

    expect(res.status).to.equal(201);
    expect(res.body.success).to.be.true;
    expect(res.body.data).to.have.property("accessToken");
    expect(res.body.data.user).to.include({
      email: validUser.email,
      username: validUser.username,
      name: validUser.name,
      isEmailVerified: false,
    });
    // Sensitive fields must not be present
    expect(res.body.data.user).to.not.have.property("password");
    expect(res.body.data.user).to.not.have.property("refreshTokens");
  });

  it("201 — sets httpOnly refreshToken cookie", async () => {
    const res = await request(app).post(`${BASE}/register`).send(validUser);

    const cookies = res.headers["set-cookie"] || [];
    const rtCookie = cookies.find((c) => c.startsWith("refreshToken="));
    expect(rtCookie).to.exist;
    expect(rtCookie).to.include("HttpOnly");
    expect(rtCookie).to.include("Path=/api/v1/auth");
  });

  it("201 — includes development verification token", async () => {
    await request(app).post(`${BASE}/register`).send(validUser);
  });

  it("201 — exposes _devVerificationToken in development", async () => {
    const res = await request(app).post(`${BASE}/register`).send(validUser);

    expect(res.body.data._devVerificationToken)
      .to.be.a("string")
      .with.length(64);
  });

  it("409 — duplicate email", async () => {
    await request(app).post(`${BASE}/register`).send(validUser);
    const res = await request(app)
      .post(`${BASE}/register`)
      .send({ ...validUser2, email: validUser.email });

    expect(res.status).to.equal(409);
    expect(res.body.message).to.include("Email");
  });

  it("409 — duplicate username", async () => {
    await request(app).post(`${BASE}/register`).send(validUser);
    const res = await request(app)
      .post(`${BASE}/register`)
      .send({ ...validUser2, username: validUser.username });

    expect(res.status).to.equal(409);
    expect(res.body.message).to.include("Username");
  });

  it("422 — missing email", async () => {
    const { email, ...body } = validUser;
    const res = await request(app).post(`${BASE}/register`).send(body);

    expect(res.status).to.equal(422);
  });

  it("422 — password too short", async () => {
    const res = await request(app)
      .post(`${BASE}/register`)
      .send({ ...validUser, password: "Abc1" });

    expect(res.status).to.equal(422);
    expect(res.body.message).to.include("8 characters");
  });

  it("422 — password missing uppercase", async () => {
    const res = await request(app)
      .post(`${BASE}/register`)
      .send({ ...validUser, password: "test1234!" });

    expect(res.status).to.equal(422);
  });

  it("422 — username has invalid characters", async () => {
    const res = await request(app)
      .post(`${BASE}/register`)
      .send({ ...validUser, username: "bad user!" });

    expect(res.status).to.equal(422);
  });

  it("422 — consent not given", async () => {
    const res = await request(app)
      .post(`${BASE}/register`)
      .send({ ...validUser, consentToDataProcessing: false });

    expect(res.status).to.equal(422);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /verify-email/:token
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /api/v1/auth/verify-email/:token", () => {
  it("200 — verifies email with valid token", async () => {
    const regRes = await request(app).post(`${BASE}/register`).send(validUser);
    const token = regRes.body.data._devVerificationToken;

    const res = await request(app).get(`${BASE}/verify-email/${token}`);

    expect(res.status).to.equal(200);
    expect(res.body.data.user.isEmailVerified).to.be.true;
  });

  it("200 — verification endpoint succeeds once", async () => {
    const regRes = await request(app).post(`${BASE}/register`).send(validUser);
    const token = regRes.body.data._devVerificationToken;

    const res = await request(app).get(`${BASE}/verify-email/${token}`);
    expect(res.status).to.equal(200);
  });

  it("400 — invalid token", async () => {
    const res = await request(app).get(`${BASE}/verify-email/deadbeefdeadbeef`);

    expect(res.status).to.equal(400);
    expect(res.body.message).to.include("invalid or has expired");
  });

  it("400 — token already used (can't verify twice)", async () => {
    const regRes = await request(app).post(`${BASE}/register`).send(validUser);
    const token = regRes.body.data._devVerificationToken;

    await request(app).get(`${BASE}/verify-email/${token}`);
    const res = await request(app).get(`${BASE}/verify-email/${token}`);

    expect(res.status).to.equal(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /login
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/v1/auth/login", () => {
  it("200 — logs in with valid credentials", async () => {
    const reg = await request(app).post(`${BASE}/register`).send(validUser);
    const vToken = reg.body.data._devVerificationToken;
    await request(app).get(`${BASE}/verify-email/${vToken}`);

    const res = await request(app)
      .post(`${BASE}/login`)
      .send({ email: validUser.email, password: validUser.password });

    expect(res.status).to.equal(200);
    expect(res.body.data).to.have.property("accessToken");
    expect(res.body.data.user.isEmailVerified).to.be.true;
  });

  it("200 — sets refreshToken cookie on login", async () => {
    const reg = await request(app).post(`${BASE}/register`).send(validUser);
    await request(app).get(
      `${BASE}/verify-email/${reg.body.data._devVerificationToken}`,
    );

    const res = await request(app)
      .post(`${BASE}/login`)
      .send({ email: validUser.email, password: validUser.password });

    const cookies = res.headers["set-cookie"] || [];
    expect(cookies.some((c) => c.startsWith("refreshToken="))).to.be.true;
  });

  it("401 — wrong password", async () => {
    const reg = await request(app).post(`${BASE}/register`).send(validUser);
    await request(app).get(
      `${BASE}/verify-email/${reg.body.data._devVerificationToken}`,
    );

    const res = await request(app)
      .post(`${BASE}/login`)
      .send({ email: validUser.email, password: "WrongPass1!" });

    expect(res.status).to.equal(401);
    expect(res.body.message).to.include("remaining");
  });

  it("401 — non-existent email", async () => {
    const res = await request(app)
      .post(`${BASE}/login`)
      .send({ email: "nobody@example.com", password: "Test1234!" });

    expect(res.status).to.equal(401);
    // Must not reveal whether email exists
    expect(res.body.message).to.equal("Invalid email or password");
  });

  it("403 — unverified email", async () => {
    await request(app).post(`${BASE}/register`).send(validUser);

    const res = await request(app)
      .post(`${BASE}/login`)
      .send({ email: validUser.email, password: validUser.password });

    expect(res.status).to.equal(403);
    expect(res.body.message).to.include("verify your email");
  });

  it("423 — account locked after 5 failed attempts", async () => {
    const reg = await request(app).post(`${BASE}/register`).send(validUser);
    await request(app).get(
      `${BASE}/verify-email/${reg.body.data._devVerificationToken}`,
    );

    // 5 wrong attempts
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post(`${BASE}/login`)
        .send({ email: validUser.email, password: "WrongPass1!" });
    }

    const res = await request(app)
      .post(`${BASE}/login`)
      .send({ email: validUser.email, password: validUser.password });

    expect(res.status).to.equal(423);
    expect(res.body.message).to.include("locked");
  });

  it("422 — missing password field", async () => {
    const res = await request(app)
      .post(`${BASE}/login`)
      .send({ email: validUser.email });

    expect(res.status).to.equal(422);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /refresh
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/v1/auth/refresh", () => {
  it("200 — returns new accessToken and rotates cookie", async () => {
    const { cookieHeader } = await registerAndLogin();

    const res = await request(app)
      .post(`${BASE}/refresh`)
      .set("Cookie", cookieHeader);

    expect(res.status).to.equal(200);
    expect(res.body.data).to.have.property("accessToken");

    // New cookie should be set (rotation)
    const cookies = res.headers["set-cookie"] || [];
    expect(cookies.some((c) => c.startsWith("refreshToken="))).to.be.true;
  });

  it("401 — no cookie", async () => {
    const res = await request(app).post(`${BASE}/refresh`);

    expect(res.status).to.equal(401);
    expect(res.body.message).to.include("No refresh token");
  });

  it("401 — tampered/invalid cookie value", async () => {
    const res = await request(app)
      .post(`${BASE}/refresh`)
      .set(
        "Cookie",
        "refreshToken=tampered.token.value; Path=/api/auth; HttpOnly",
      );

    expect(res.status).to.equal(401);
  });

  it("401 — reuse of already-rotated token wipes all sessions", async () => {
    const { cookieHeader } = await registerAndLogin();

    // First refresh — rotates the token
    const firstRefresh = await request(app)
      .post(`${BASE}/refresh`)
      .set("Cookie", cookieHeader);
    expect(firstRefresh.status).to.equal(200);

    // Reuse the OLD cookie — should fail and wipe all sessions
    const reuseRes = await request(app)
      .post(`${BASE}/refresh`)
      .set("Cookie", cookieHeader);

    expect(reuseRes.status).to.equal(401);
    expect(reuseRes.body.message).to.include(
      "invalid or has already been used",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /logout
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/v1/auth/logout", () => {
  it("200 — logs out and clears cookie", async () => {
    const { cookieHeader } = await registerAndLogin();

    const res = await request(app)
      .post(`${BASE}/logout`)
      .set("Cookie", cookieHeader);

    expect(res.status).to.equal(200);
    // Cookie should be cleared (Max-Age=0 or Expires in past)
    const cookies = res.headers["set-cookie"] || [];
    const rtCookie = cookies.find((c) => c.startsWith("refreshToken="));
    expect(rtCookie).to.satisfy(
      (c) =>
        c === undefined ||
        c.includes("Max-Age=0") ||
        c.includes("Expires=Thu, 01 Jan 1970"),
    );
  });

  it("200 — works gracefully even with no cookie", async () => {
    const res = await request(app).post(`${BASE}/logout`);

    expect(res.status).to.equal(200);
    expect(res.body.message).to.equal("Logged out successfully");
  });

  it("401 — refresh fails after logout", async () => {
    const { cookieHeader } = await registerAndLogin();

    await request(app).post(`${BASE}/logout`).set("Cookie", cookieHeader);

    const refreshRes = await request(app)
      .post(`${BASE}/refresh`)
      .set("Cookie", cookieHeader);

    expect(refreshRes.status).to.equal(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /logout-all
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/v1/auth/logout-all", () => {
  it("200 — invalidates all sessions", async () => {
    const { accessToken, cookieHeader } = await registerAndLogin();

    const res = await request(app)
      .post(`${BASE}/logout-all`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Cookie", cookieHeader);

    expect(res.status).to.equal(200);

    // Old token should no longer refresh
    const refreshRes = await request(app)
      .post(`${BASE}/refresh`)
      .set("Cookie", cookieHeader);

    expect(refreshRes.status).to.equal(401);
  });

  it("401 — requires authentication", async () => {
    const res = await request(app).post(`${BASE}/logout-all`);

    expect(res.status).to.equal(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /me
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /api/v1/auth/me", () => {
  it("200 — returns user profile", async () => {
    const { accessToken } = await registerAndLogin();

    const res = await request(app)
      .get(`${BASE}/me`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).to.equal(200);
    expect(res.body.data.user).to.include({
      email: validUser.email,
      username: validUser.username,
    });
    expect(res.body.data.user).to.not.have.property("password");
  });

  it("401 — no token", async () => {
    const res = await request(app).get(`${BASE}/me`);

    expect(res.status).to.equal(401);
  });

  it("401 — expired/invalid token", async () => {
    const res = await request(app)
      .get(`${BASE}/me`)
      .set("Authorization", "Bearer not.a.real.token");

    expect(res.status).to.equal(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /sessions
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /api/v1/auth/sessions", () => {
  it("200 — returns active sessions list", async () => {
    const { accessToken } = await registerAndLogin();

    const res = await request(app)
      .get(`${BASE}/sessions`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).to.equal(200);
    expect(res.body.data.sessions).to.be.an("array");
    expect(res.body.data.count).to.be.a("number");
    // At least the current session
    expect(res.body.data.count).to.be.at.least(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /forgot-password
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/v1/auth/forgot-password", () => {
  it("200 — always 200 (prevents email enumeration)", async () => {
    const res = await request(app)
      .post(`${BASE}/forgot-password`)
      .send({ email: "nobody@example.com" });

    expect(res.status).to.equal(200);
    expect(res.body.message).to.include("If that email is registered");
  });

  it("200 — returns reset flow response when email exists", async () => {
    const reg = await request(app).post(`${BASE}/register`).send(validUser);
    await request(app).get(
      `${BASE}/verify-email/${reg.body.data._devVerificationToken}`,
    );

    const res = await request(app)
      .post(`${BASE}/forgot-password`)
      .send({ email: validUser.email });

    expect(res.status).to.equal(200);
    expect(res.body.message).to.include("If that email is registered");
  });

  it("200 — returns _devResetToken in development", async () => {
    const reg = await request(app).post(`${BASE}/register`).send(validUser);
    await request(app).get(
      `${BASE}/verify-email/${reg.body.data._devVerificationToken}`,
    );

    const res = await request(app)
      .post(`${BASE}/forgot-password`)
      .send({ email: validUser.email });

    expect(res.body.data._devResetToken).to.be.a("string");
  });

  it("422 — invalid email format", async () => {
    const res = await request(app)
      .post(`${BASE}/forgot-password`)
      .send({ email: "not-an-email" });

    expect(res.status).to.equal(422);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /reset-password
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/v1/auth/reset-password", () => {
  const getResetToken = async () => {
    const reg = await request(app).post(`${BASE}/register`).send(validUser);
    await request(app).get(
      `${BASE}/verify-email/${reg.body.data._devVerificationToken}`,
    );

    const fp = await request(app)
      .post(`${BASE}/forgot-password`)
      .send({ email: validUser.email });

    return fp.body.data._devResetToken;
  };

  it("200 — resets password with valid token", async () => {
    const token = await getResetToken();

    const res = await request(app).post(`${BASE}/reset-password`).send({
      token,
      password: "NewPass1234!",
      confirmPassword: "NewPass1234!",
    });

    expect(res.status).to.equal(200);
    expect(res.body.message).to.include("reset successful");
  });

  it("200 — can login with new password after reset", async () => {
    const token = await getResetToken();
    await request(app).post(`${BASE}/reset-password`).send({
      token,
      password: "NewPass1234!",
      confirmPassword: "NewPass1234!",
    });

    const loginRes = await request(app)
      .post(`${BASE}/login`)
      .send({ email: validUser.email, password: "NewPass1234!" });

    expect(loginRes.status).to.equal(200);
  });

  it("200 — invalidates reset token after successful reset", async () => {
    const token = await getResetToken();
    const first = await request(app).post(`${BASE}/reset-password`).send({
      token,
      password: "NewPass1234!",
      confirmPassword: "NewPass1234!",
    });

    const second = await request(app).post(`${BASE}/reset-password`).send({
      token,
      password: "AnotherPass1!",
      confirmPassword: "AnotherPass1!",
    });

    expect(first.status).to.equal(200);
    expect(second.status).to.equal(400);
  });

  it("400 — invalid/expired token", async () => {
    const res = await request(app).post(`${BASE}/reset-password`).send({
      token: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      password: "NewPass1234!",
      confirmPassword: "NewPass1234!",
    });

    expect(res.status).to.equal(400);
  });

  it("400 — cannot reuse last 3 passwords", async () => {
    const token = await getResetToken();

    // Reset to same password (originalpassword = Test1234!)
    const res = await request(app).post(`${BASE}/reset-password`).send({
      token,
      password: "Test1234!", // same as original
      confirmPassword: "Test1234!",
    });

    expect(res.status).to.equal(400);
    expect(res.body.message).to.include("Cannot reuse your last 3 passwords");
  });

  it("422 — passwords don't match", async () => {
    const token = await getResetToken();

    const res = await request(app).post(`${BASE}/reset-password`).send({
      token,
      password: "NewPass1234!",
      confirmPassword: "DifferentPass1!",
    });

    expect(res.status).to.equal(422);
    expect(res.body.message).to.include("match");
  });

  it("400 — cannot use same token twice", async () => {
    const token = await getResetToken();
    await request(app).post(`${BASE}/reset-password`).send({
      token,
      password: "NewPass1234!",
      confirmPassword: "NewPass1234!",
    });

    const res = await request(app).post(`${BASE}/reset-password`).send({
      token,
      password: "AnotherPass1!",
      confirmPassword: "AnotherPass1!",
    });

    expect(res.status).to.equal(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /change-password
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/v1/auth/change-password", () => {
  it("200 — changes password when authenticated", async () => {
    const { accessToken } = await registerAndLogin();

    const res = await request(app)
      .post(`${BASE}/change-password`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        currentPassword: validUser.password,
        newPassword: "NewPass9999!",
        confirmPassword: "NewPass9999!",
      });

    expect(res.status).to.equal(200);
  });

  it("401 — wrong current password", async () => {
    const { accessToken } = await registerAndLogin();

    const res = await request(app)
      .post(`${BASE}/change-password`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        currentPassword: "WrongCurrent1!",
        newPassword: "NewPass9999!",
        confirmPassword: "NewPass9999!",
      });

    expect(res.status).to.equal(401);
    expect(res.body.message).to.include("incorrect");
  });

  it("401 — requires authentication", async () => {
    const res = await request(app).post(`${BASE}/change-password`).send({
      currentPassword: validUser.password,
      newPassword: "NewPass9999!",
      confirmPassword: "NewPass9999!",
    });

    expect(res.status).to.equal(401);
  });

  it("403 — requires verified email", async () => {
    // Register but don't verify email
    const reg = await request(app).post(`${BASE}/register`).send(validUser);
    const accessToken = reg.body.data.accessToken;

    const res = await request(app)
      .post(`${BASE}/change-password`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        currentPassword: validUser.password,
        newPassword: "NewPass9999!",
        confirmPassword: "NewPass9999!",
      });

    expect(res.status).to.equal(403);
    expect(res.body.message).to.include("verify your email");
  });

  it("422 — new password same as current (validator catches it)", async () => {
    const { accessToken } = await registerAndLogin();

    const res = await request(app)
      .post(`${BASE}/change-password`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        currentPassword: validUser.password,
        newPassword: validUser.password, // same!
        confirmPassword: validUser.password,
      });

    expect(res.status).to.equal(422);
    expect(res.body.message).to.include("different");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /resend-verification
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/v1/auth/resend-verification", () => {
  it("200 — resends verification email", async () => {
    const reg = await request(app).post(`${BASE}/register`).send(validUser);
    const accessToken = reg.body.data.accessToken;

    const res = await request(app)
      .post(`${BASE}/resend-verification`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).to.equal(200);
    expect(res.body.message).to.include("Verification email sent");
  });

  it("400 — already verified", async () => {
    const { accessToken } = await registerAndLogin(); // registerAndLogin verifies email

    const res = await request(app)
      .post(`${BASE}/resend-verification`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).to.equal(400);
    expect(res.body.message).to.include("already verified");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// tokenVersion invalidation (logout-all → old access token rejected)
// ═══════════════════════════════════════════════════════════════════════════════

describe("tokenVersion invalidation", () => {
  it("rejects old access token after logout-all", async () => {
    const { accessToken, cookieHeader } = await registerAndLogin();

    // Capture a second access token via refresh (to simulate 2 devices)
    const refreshRes = await request(app)
      .post(`${BASE}/refresh`)
      .set("Cookie", cookieHeader);
    const secondToken = refreshRes.body.data.accessToken;

    // Logout all
    await request(app)
      .post(`${BASE}/logout-all`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Cookie", cookieHeader);

    // Both access tokens should now fail the tokenVersion check
    const res1 = await request(app)
      .get(`${BASE}/me`)
      .set("Authorization", `Bearer ${accessToken}`);
    const res2 = await request(app)
      .get(`${BASE}/me`)
      .set("Authorization", `Bearer ${secondToken}`);

    expect(res1.status).to.equal(401);
    expect(res2.status).to.equal(401);
    expect(res1.body.message).to.include("invalidated");
  });
});
