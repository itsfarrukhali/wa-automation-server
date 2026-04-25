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

  // WhatsApp Meta Cloud API
  WA_TOKEN: required("WA_TOKEN"),
  WA_PHONE_ID: required("WA_PHONE_ID"),
  WEBHOOK_VERIFY_TOKEN: required("WEBHOOK_VERIFY_TOKEN"),
  WHATSAPP_ENCRYPTION_KEY: required("WHATSAPP_ENCRYPTION_KEY"),

  // Frontend URL for CORS
  CLIENT_URL: optional("CLIENT_URL", "http://localhost:5173"),

  // Claude API (for AI features)
  ANTHROPIC_API_KEY: optional("ANTHROPIC_API_KEY"),

  // Upstash Redis (for BullMQ)
  UPSTASH_REDIS_URL: optional("UPSTASH_REDIS_URL"),
  UPSTASH_REDIS_TOKEN: optional("UPSTASH_REDIS_TOKEN"),

  // Email (for notifications)
  GMAIL_USER: required("GMAIL_USER"),
  GMAIL_APP_PASSWORD: required("GMAIL_APP_PASSWORD"),
  EMAIL_FROM: optional("EMAIL_FROM"),
};
