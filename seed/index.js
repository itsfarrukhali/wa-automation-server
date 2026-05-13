import mongoose from "mongoose";
import { env } from "../src/lib/env.js";
import { seedSuperAdmin } from "./seedSuperAdmin.js";

const runSeeds = async () => {
  try {
    console.log("🌱 Starting database seeding...\n");

    // Connect to MongoDB
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(env.MONGODB_URI);
    console.log("✅ MongoDB Connected\n");

    // Run seeders in sequence
    console.log("=".repeat(50));
    console.log("1️⃣  Seeding Super Admin...");
    console.log("=".repeat(50));
    await seedSuperAdmin();

    console.log("✅ Seeding completed successfully!");
  } catch (error) {
    console.error("\n❌ Seeding failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB.");
    process.exit(0);
  }
};

runSeeds();
