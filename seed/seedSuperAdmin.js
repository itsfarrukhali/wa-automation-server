/**
 * scripts/seedSuperAdmin.js
 * Refactored to export the seed function
 */

import User from "../src/models/user.model.js";
import { env } from "../src/lib/env.js";

// Export the seed function
export const seedSuperAdmin = async () => {
  // Validation
  if (!env.SUPERADMIN_EMAIL || !env.SUPERADMIN_PASSWORD) {
    console.error(
      "❌  SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD must be set.\n" +
        "    Skipping super admin seeding.",
    );
    return;
  }

  if (env.SUPERADMIN_PASSWORD.length < 8) {
    console.error("❌  SUPERADMIN_PASSWORD must be at least 8 characters.");
    return;
  }

  // Guard: check if superadmin already exists
  const existingSuperAdmin = await User.findOne({ role: "superadmin" });

  if (existingSuperAdmin) {
    console.log(
      `ℹ️   A superadmin account already exists: ${existingSuperAdmin.email}`,
    );
    console.log("    Skipping super admin creation.");
    return;
  }

  // Guard: check if the email is already taken
  const emailTaken = await User.findOne({ email: env.SUPERADMIN_EMAIL });
  if (emailTaken) {
    console.error(
      `❌  The email "${env.SUPERADMIN_EMAIL}" is already registered with role "${emailTaken.role}".`,
    );
    return;
  }

  // Guard: check if the username is already taken
  const usernameTaken = await User.findOne({
    username: env.SUPERADMIN_USERNAME,
  });
  if (usernameTaken) {
    console.error(
      `❌  The username "${env.SUPERADMIN_USERNAME}" is already taken.`,
    );
    return;
  }

  // Create superadmin
  const superAdmin = await User.create({
    name: env.SUPERADMIN_NAME || "Super Admin",
    username: env.SUPERADMIN_USERNAME || "superadmin",
    email: env.SUPERADMIN_EMAIL,
    password: env.SUPERADMIN_PASSWORD,
    role: "superadmin",
    isEmailVerified: true,
    consentToDataProcessing: true,
    isActive: true,
  });

  console.log("\n✅  Superadmin created successfully!");
  console.log(`    ID:       ${superAdmin._id}`);
  console.log(`    Name:     ${superAdmin.name}`);
  console.log(`    Username: ${superAdmin.username}`);
  console.log(`    Email:    ${superAdmin.email}`);
  console.log(`    Role:     ${superAdmin.role}`);
  console.log("\n⚠️   IMPORTANT: Change the password after your first login.");
};
