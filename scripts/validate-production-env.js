const required = [
  "NODE_ENV",
  "PORT",
  "MONGODB_URI",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "WEBHOOK_VERIFY_TOKEN",
  "WHATSAPP_ENCRYPTION_KEY",
  "CLIENT_URL",
  "GMAIL_USER",
  "GMAIL_APP_PASSWORD",
];

const recommended = [
  "WA_TOKEN",
  "WA_PHONE_ID",
  "WHATSAPP_GRAPH_VERSION",
  "SUPERADMIN_EMAIL",
  "SUPERADMIN_PASSWORD",
];

const weakSecret = (value) => !value || String(value).length < 32;

const missingRequired = required.filter((key) => !process.env[key]);
const missingRecommended = recommended.filter((key) => !process.env[key]);
const weakSecrets = ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "WHATSAPP_ENCRYPTION_KEY"].filter(
  (key) => weakSecret(process.env[key]),
);

if (missingRequired.length > 0) {
  console.error("[env] Missing required production variables:");
  for (const key of missingRequired) console.error(`- ${key}`);
}

if (weakSecrets.length > 0) {
  console.error("[env] These secrets should be at least 32 characters:");
  for (const key of weakSecrets) console.error(`- ${key}`);
}

if (missingRecommended.length > 0) {
  console.warn("[env] Recommended variables not set yet:");
  for (const key of missingRecommended) console.warn(`- ${key}`);
}

if (missingRequired.length > 0 || weakSecrets.length > 0) {
  process.exit(1);
}

console.log("[env] Production environment looks deploy-ready.");
