import dotenv from "dotenv";
dotenv.config();

const required = (key) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`[env] Missing required environment variable: ${key}`);
  }
  return value;
};

const optional = (key, defaultValue = "") => {
  return process.env[key] || defaultValue;
};

export const env = {
  NODE_ENV: optional("NODE_ENV", "development"),
  PORT: parseInt(optional("PORT", "5000")),

  // Database
  MONGODB_URI: required("MONGODB_URI"),

  // JWT
  JWT_ACCESS_SECRET: required("JWT_ACCESS_SECRET"),
  JWT_REFRESH_SECRET: required("JWT_REFRESH_SECRET"),
  JWT_EXPIRES_IN: optional("JWT_EXPIRES_IN", "15m"),
  REFRESH_TOKEN_EXPIRY_DAYS: optional("REFRESH_TOKEN_EXPIRY_DAYS", "7"),
  BCRYPT_SALT_ROUNDS: parseInt(optional("BCRYPT_SALT_ROUNDS", "12")),

  // Rate limiting
  RATE_LIMIT_ENABLED: optional(
    "RATE_LIMIT_ENABLED",
    optional("NODE_ENV", "development") === "test" ? "false" : "true",
  ),
  RATE_LIMIT_WINDOW_MS: parseInt(optional("RATE_LIMIT_WINDOW_MS", "60000")),
  RATE_LIMIT_MAX: parseInt(optional("RATE_LIMIT_MAX", "300")),
  AUTH_RATE_LIMIT_MAX: parseInt(optional("AUTH_RATE_LIMIT_MAX", "20")),
  WHATSAPP_RATE_LIMIT_MAX: parseInt(optional("WHATSAPP_RATE_LIMIT_MAX", "60")),

  // WhatsApp Meta Cloud API
  WA_TOKEN: optional("WA_TOKEN"),
  WA_PHONE_ID: optional("WA_PHONE_ID"),
  WHATSAPP_GRAPH_VERSION: optional("WHATSAPP_GRAPH_VERSION", "v20.0"),
  WEBHOOK_VERIFY_TOKEN: optional("WEBHOOK_VERIFY_TOKEN"),
  WHATSAPP_ENCRYPTION_KEY: optional("WHATSAPP_ENCRYPTION_KEY"),

  // Background workers
  ENABLE_SCHEDULER_WORKER: optional("ENABLE_SCHEDULER_WORKER", "false"),
  SCHEDULER_INTERVAL_SECONDS: parseInt(
    optional("SCHEDULER_INTERVAL_SECONDS", "60"),
  ),
  SCHEDULER_BATCH_LIMIT: parseInt(optional("SCHEDULER_BATCH_LIMIT", "25")),
  SCHEDULER_LOCK_SECONDS: parseInt(optional("SCHEDULER_LOCK_SECONDS", "120")),

  // Frontend URL for CORS
  CLIENT_URL: optional("CLIENT_URL", "http://localhost:5173"),
  CORS_ALLOWED_ORIGINS: optional("CORS_ALLOWED_ORIGINS"),
  ALLOW_LOCAL_ORIGINS: optional("ALLOW_LOCAL_ORIGINS", "false"),

  // Claude API (for AI features)
  ANTHROPIC_API_KEY: optional("ANTHROPIC_API_KEY"),

  // Upstash Redis (for BullMQ)
  UPSTASH_REDIS_URL: optional("UPSTASH_REDIS_URL"),
  UPSTASH_REDIS_TOKEN: optional("UPSTASH_REDIS_TOKEN"),

  // Email (for notifications)
  GMAIL_USER: required("GMAIL_USER"),
  GMAIL_APP_PASSWORD: required("GMAIL_APP_PASSWORD"),
  EMAIL_FROM: optional("EMAIL_FROM"),

  // Super Admin seeding
  SUPERADMIN_EMAIL: optional("SUPERADMIN_EMAIL"),
  SUPERADMIN_PASSWORD: optional("SUPERADMIN_PASSWORD"),
  SUPERADMIN_NAME: optional("SUPERADMIN_NAME", "Zario Super Admin"),
  SUPERADMIN_USERNAME: optional("SUPERADMIN_USERNAME", "superadmin"),
};
