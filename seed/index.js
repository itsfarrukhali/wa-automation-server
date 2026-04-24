import mongoose from "mongoose";
import { env } from "../src/lib/env.js";
import { seedCategories } from "./categories.js";

const runSeed = async () => {
  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log("✅ MongoDB Connected");

    await seedCategories();

    console.log("🌱 Seeding Done");
    process.exit();
  } catch (error) {
    console.error("❌ Seeding Error:", error);
    process.exit(1);
  }
};

runSeed();
