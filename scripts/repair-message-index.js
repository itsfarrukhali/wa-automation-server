import mongoose from "mongoose";
import dotenv from "dotenv";
import MessageLog from "../src/models/messagelog.model.js";
import Business from "../src/models/business/business.model.js";

dotenv.config();

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error("MONGODB_URI is required.");
  process.exit(1);
}

const DEFAULT_PLAN_LIMITS = {
  free: 500,
  starter: 2000,
  growth: 10000,
  enterprise: 50000,
};

const main = async () => {
  await mongoose.connect(uri);

  const nullCleanup = await MessageLog.updateMany(
    { waMessageId: null },
    { $unset: { waMessageId: "" } },
  );

  try {
    await MessageLog.collection.dropIndex("wa_message_lookup");
    console.log("Dropped old wa_message_lookup index.");
  } catch (error) {
    if (error?.codeName !== "IndexNotFound") throw error;
    console.log("Old wa_message_lookup index did not exist.");
  }

  await MessageLog.collection.createIndex(
    { waMessageId: 1 },
    {
      unique: true,
      name: "wa_message_lookup",
      partialFilterExpression: {
        waMessageId: { $type: "string" },
      },
    },
  );

  const businesses = await Business.find({});
  let repairedPlans = 0;

  for (const business of businesses) {
    const currentPlan = business.plan?.currentPlan || "free";
    const defaultLimit = DEFAULT_PLAN_LIMITS[currentPlan] ?? 500;
    let changed = false;

    business.plan = business.plan || {};
    business.plan.limits = business.plan.limits || {};
    business.plan.usage = business.plan.usage || {};

    if (business.plan.limits.monthlyMessages == null) {
      business.plan.limits.monthlyMessages = defaultLimit;
      changed = true;
    }
    if (business.plan.limits.staffAccounts == null) {
      business.plan.limits.staffAccounts = currentPlan === "free" ? 1 : 3;
      changed = true;
    }
    if (business.plan.limits.customers == null) {
      business.plan.limits.customers = currentPlan === "free" ? 100 : 500;
      changed = true;
    }
    if (business.plan.usage.messagesThisMonth == null) {
      business.plan.usage.messagesThisMonth = 0;
      changed = true;
    }

    if (changed) {
      business.markModified("plan");
      await business.save();
      repairedPlans += 1;
    }
  }

  console.log("MessageLog null waMessageId cleanup:", {
    matched: nullCleanup.matchedCount,
    modified: nullCleanup.modifiedCount,
  });
  console.log("Recreated wa_message_lookup as partial unique index.");
  console.log(`Repaired missing plan limits/usage for ${repairedPlans} businesses.`);
};

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
