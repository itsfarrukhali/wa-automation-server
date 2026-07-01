import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

const testFiles = readdirSync(resolve("tests"))
  .filter((file) => file.endsWith(".test.js"))
  .sort()
  .map((file) => resolve("tests", file));

const testEnv = {
  ...process.env,
  NODE_ENV: "test",
  MONGODB_URI:
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/zario-test",
  JWT_ACCESS_SECRET:
    process.env.JWT_ACCESS_SECRET || "test-access-secret-test-access-secret",
  JWT_REFRESH_SECRET:
    process.env.JWT_REFRESH_SECRET || "test-refresh-secret-test-refresh-secret",
  WA_TOKEN: process.env.WA_TOKEN || "test-token",
  WA_PHONE_ID: process.env.WA_PHONE_ID || "test-phone-id",
  WEBHOOK_VERIFY_TOKEN:
    process.env.WEBHOOK_VERIFY_TOKEN || "test-webhook-token",
  WHATSAPP_ENCRYPTION_KEY:
    process.env.WHATSAPP_ENCRYPTION_KEY ||
    "12345678901234567890123456789012",
  GMAIL_USER: process.env.GMAIL_USER || "test@example.com",
  GMAIL_APP_PASSWORD: process.env.GMAIL_APP_PASSWORD || "test-password",
};

const mochaBin = resolve("node_modules", "mocha", "bin", "mocha.js");

for (const testFile of testFiles) {
  console.log(`\n=== ${testFile.split(/[\\/]/).pop()} ===`);

  const result = spawnSync(
    process.execPath,
    [
      mochaBin,
      "--experimental-vm-modules",
      "--timeout",
      "15000",
      "--exit",
      testFile,
    ],
    {
      cwd: process.cwd(),
      env: testEnv,
      stdio: "inherit",
    },
  );

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
