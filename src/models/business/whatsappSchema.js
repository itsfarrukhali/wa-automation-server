import mongoose from "mongoose";
import crypto from "crypto";
import { env } from "../../lib/env.js";

const messageStatsSchema = new mongoose.Schema(
  {
    total: {
      type: Number,
      default: 0,
    },
    thisMonth: {
      type: Number,
      default: 0,
    },
    today: {
      type: Number,
      default: 0,
    },
    delivered: {
      type: Number,
      default: 0,
    },
    read: {
      type: Number,
      default: 0,
    },
    failed: {
      type: Number,
      default: 0,
    },
  },
  { _id: false },
);

const templateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    language: { type: String, default: "ur" },
    category: {
      type: String,
      enum: [
        "UTILITY",
        "MARKETING",
        "AUTHENTICATION",
        "ALERT_UPDATE",
        "TRANSACTIONAL",
        "OTP",
        "OTHER",
      ],
      default: "OTHER",
    },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "DISABLED"],
      default: "PENDING",
    },
    components: [mongoose.Schema.Types.Mixed],
    usageCount: {
      type: Number,
      default: 0,
    },
    lastUsed: Date,
  },
  { _id: true },
);

const whatsappSchema = new mongoose.Schema(
  {
    // WhatsApp Business API fields
    wabaId: {
      type: String,
      select: false, // Security: Never expose in API
    },
    phoneNumberId: {
      type: String,
      required: function () {
        return this.connectionStatus === "connected";
      },
    },
    displayPhoneNumber: String,
    verifiedName: String,

    // Encrypted access token
    accessToken: {
      type: String,
      select: false,
    },
    tokenExpiresAt: Date,

    // Webhook configuration
    webhookUrl: String,
    webhookVerifyToken: {
      type: String,
      select: false,
    },

    // Connection status
    connectionStatus: {
      type: String,
      enum: ["disconnected", "connecting", "connected", "failed", "expired"],
      default: "disconnected",
    },
    lastConnectedAt: Date,
    connectionError: String,

    // QR Code for initial setup
    qrCode: String,
    qrExpiresAt: Date,

    // Usage statistics
    messages: messageStatsSchema,

    // WhatsApp Business verification
    isBusinessVerified: { type: Boolean, default: false },
    qualityRating: {
      type: String,
      enum: ["GREEN", "YELLOW", "RED", "UNKNOWN"],
      default: "UNKNOWN",
    },

    // Message templates
    templates: [templateSchema],

    // Webhook events tracking
    webhookEvents: [
      {
        event: String,
        timestamp: Date,
        data: mongoose.Schema.Types.Mixed,
      },
    ],
  },
  { _id: false },
);

// Methods
whatsappSchema.methods.encryptToken = function (token) {
  if (!token) return null;

  const algorithm = "aes-256-gcm";
  const key = crypto.scryptSync(env.WHATSAPP_ENCRYPTION_KEY, "salt", 32);
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(token, "utf8", "hex");
  encrypted += cipher.final("hex");

  return {
    encrypted,
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
  };
};

whatsappSchema.methods.decryptToken = function () {
  // TODO: Implement decryption logic using the stored encrypted token, IV, and auth tag
  // Implementation for decrypting stored token
  // Returns decrypted token for API calls
};

whatsappSchema.methods.isConnected = function () {
  return (
    this.connectionStatus === "connected" && this.tokenExpiresAt > new Date()
  );
};

whatsappSchema.methods.incrementMessageCount = function (
  type = "sent",
  count = 1,
) {
  this.messages.total += count;
  this.messages.thisMonth += count;
  this.messages.today += count;

  if (type === "delivered") this.messages.delivered += count;
  if (type === "read") this.messages.read += count;
  if (type === "failed") this.messages.failed += count;
};

export default whatsappSchema;
