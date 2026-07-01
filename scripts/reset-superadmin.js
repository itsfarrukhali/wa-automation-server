import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import mongoose from "mongoose";

const envPath = path.resolve(".env");
dotenv.config({ path: envPath });

const required = (key) => {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} must be set in .env`);
  return value;
};

const setEnvValue = (key, value) => {
  const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escapedKey}=.*$`, "m");
  const next = pattern.test(current)
    ? current.replace(pattern, `${key}=${value}`)
    : `${current}${current.endsWith("\n") || current.length === 0 ? "" : "\n"}${key}=${value}\n`;

  fs.writeFileSync(envPath, next, { encoding: "utf8", mode: 0o600 });
};

const generatePassword = () =>
  `${crypto.randomBytes(12).toString("base64url")}Aa1!`;

const run = async () => {
  const mongoUri = required("MONGODB_URI");
  const email = required("SUPERADMIN_EMAIL").toLowerCase();
  const configuredPassword = process.env.SUPERADMIN_PASSWORD?.trim();
  const password = configuredPassword || generatePassword();

  if (password.length < 8) {
    throw new Error("SUPERADMIN_PASSWORD must be at least 8 characters");
  }

  if (!configuredPassword) {
    setEnvValue("SUPERADMIN_PASSWORD", password);
  }

  await mongoose.connect(mongoUri);

  // The User model imports centralized app config. Password reset itself does
  // not use these integrations, so provide non-secret local placeholders when
  // they are intentionally absent from a maintenance environment.
  process.env.JWT_ACCESS_SECRET ||= "maintenance-access-secret";
  process.env.JWT_REFRESH_SECRET ||= "maintenance-refresh-secret";
  process.env.WA_TOKEN ||= "maintenance-token";
  process.env.WA_PHONE_ID ||= "maintenance-phone-id";
  process.env.WEBHOOK_VERIFY_TOKEN ||= "maintenance-webhook-token";
  process.env.WHATSAPP_ENCRYPTION_KEY ||=
    "12345678901234567890123456789012";
  process.env.GMAIL_USER ||= "maintenance@example.com";
  process.env.GMAIL_APP_PASSWORD ||= "maintenance-password";

  const { default: User } = await import("../src/models/user.model.js");

  let superAdmin = await User.findOne({ role: "superadmin" }).select(
    "+password +refreshTokens +tokenVersion +passwordHistory",
  );

  if (!superAdmin) {
    superAdmin = await User.findOne({ email }).select(
      "+password +refreshTokens +tokenVersion +passwordHistory",
    );
  }

  if (!superAdmin) {
    superAdmin = new User({
      name: process.env.SUPERADMIN_NAME?.trim() || "Zario Super Admin",
      username: process.env.SUPERADMIN_USERNAME?.trim() || "superadmin",
      email,
      password,
      role: "superadmin",
      isEmailVerified: true,
      consentToDataProcessing: true,
      isActive: true,
    });
  } else {
    superAdmin.email = email;
    superAdmin.password = password;
    superAdmin.role = "superadmin";
    superAdmin.isEmailVerified = true;
    superAdmin.isActive = true;
    superAdmin.refreshTokens = [];
    superAdmin.tokenVersion = (superAdmin.tokenVersion || 0) + 1;
  }

  await superAdmin.save();

  console.log("Super-admin access reset successfully.");
  console.log(`Email: ${superAdmin.email}`);
  console.log("Password: stored in SUPERADMIN_PASSWORD inside your local .env");
  console.log("All previous super-admin sessions were invalidated.");
};

try {
  await run();
} catch (error) {
  console.error(`Super-admin reset failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
