import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import Business from "../src/models/business/business.model.js";
import Category from "../src/models/common/categorySchema.js";
import User from "../src/models/user.model.js";
import * as StaffService from "../src/services/staff.service.js";

let mongod;
let ownsMongoConnection = false;

const seedContext = async ({ staffLimit = 3 } = {}) => {
  const owner = await User.create({
    email: "staff-owner@test.com",
    username: "staffowner",
    password: "Password123!",
    name: "Staff Owner",
    isEmailVerified: true,
    consentToDataProcessing: true,
    role: "owner",
  });

  const business = await Business.create({
    name: "Staff Salon",
    type: "salon",
    ownerId: owner._id,
    onboardingStep: 5,
    onboardingComplete: true,
    plan: {
      currentPlan: "starter",
      limits: {
        monthlyMessages: 500,
        staffAccounts: staffLimit,
        customers: 500,
      },
      usage: {
        messagesThisMonth: 0,
        activeStaffCount: 0,
        customerCount: 0,
      },
    },
  });

  owner.businessId = business._id;
  await owner.save();

  return { owner, business };
};

const staffPayload = (overrides = {}) => ({
  name: "Sara Staff",
  email: "sara.staff@test.com",
  username: "sarastaff",
  password: "Password123!",
  phone: "03001234567",
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
  if (ownsMongoConnection) {
    await mongoose.disconnect();
    await mongod.stop();
  }
});

beforeEach(async () => {
  await Promise.all([Business.deleteMany({}), User.deleteMany({})]);
  await Category.findOneAndUpdate(
    { name: "salon" },
    { $set: { name: "salon", isActive: true } },
    { upsert: true, returnDocument: "after" },
  );
});

describe("StaffService", () => {
  it("creates staff, links business, and updates active staff usage", async () => {
    const { owner, business } = await seedContext();

    const staff = await StaffService.createStaff(
      owner._id.toString(),
      staffPayload(),
    );

    assert.equal(staff.role, "staff");
    assert.equal(staff.businessId.toString(), business._id.toString());
    assert.equal(staff.isEmailVerified, true);

    const updatedBusiness = await Business.findById(business._id);
    assert.equal(updatedBusiness.staffIds.length, 1);
    assert.equal(updatedBusiness.plan.usage.activeStaffCount, 1);
  });

  it("lists staff for the owner business only", async () => {
    const { owner } = await seedContext();
    await StaffService.createStaff(owner._id.toString(), staffPayload());

    const result = await StaffService.listStaff(owner._id.toString(), {
      page: 1,
      limit: 10,
    });

    assert.equal(result.staff.length, 1);
    assert.equal(result.usage.activeStaffCount, 1);
  });

  it("blocks staff creation when plan limit is reached", async () => {
    const { owner } = await seedContext({ staffLimit: 1 });
    await StaffService.createStaff(owner._id.toString(), staffPayload());

    await assert.rejects(
      () =>
        StaffService.createStaff(
          owner._id.toString(),
          staffPayload({
            email: "second.staff@test.com",
            username: "secondstaff",
          }),
        ),
      /Staff account limit reached/,
    );
  });

  it("updates and deactivates staff", async () => {
    const { owner, business } = await seedContext();
    const staff = await StaffService.createStaff(
      owner._id.toString(),
      staffPayload(),
    );

    const updated = await StaffService.updateStaff(
      owner._id.toString(),
      staff._id.toString(),
      { name: "Sara Updated" },
    );
    assert.equal(updated.name, "Sara Updated");

    const inactive = await StaffService.setStaffStatus(
      owner._id.toString(),
      staff._id.toString(),
      false,
    );
    assert.equal(inactive.isActive, false);

    const updatedBusiness = await Business.findById(business._id);
    assert.equal(updatedBusiness.plan.usage.activeStaffCount, 0);
  });

  it("soft-removes staff from the business team", async () => {
    const { owner, business } = await seedContext();
    const staff = await StaffService.createStaff(
      owner._id.toString(),
      staffPayload(),
    );

    const result = await StaffService.deleteStaff(
      owner._id.toString(),
      staff._id.toString(),
    );

    assert.equal(result.deleted, true);

    const updatedStaff = await User.findById(staff._id);
    assert.equal(updatedStaff.isActive, false);

    const updatedBusiness = await Business.findById(business._id);
    assert.equal(updatedBusiness.staffIds.length, 0);
  });
});
