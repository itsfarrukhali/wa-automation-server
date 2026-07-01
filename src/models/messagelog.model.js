import mongoose from "mongoose";

// Media attachment schema
const mediaSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "image",
        "video",
        "audio",
        "document",
        "sticker",
        "location",
        "contact",
      ],
      required: true,
    },
    url: String, // WhatsApp media URL (expires)
    mimeType: String,
    filename: String,
    size: Number, // bytes
    // For images/videos
    width: Number,
    height: Number,
    duration: Number, // For audio/video (seconds)
    // Location
    latitude: Number,
    longitude: Number,
    // For stickers
    stickerId: String,
  },
  { _id: false },
);

// Interactive message tracking (buttons, lists)
const interactiveSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["button", "list", "cta_url", "quick_reply", "catalog", "flow"],
      required: true,
    },
    payload: mongoose.Schema.Types.Mixed, // Button/list data
    userSelection: {
      id: String,
      title: String,
      value: String,
    },
    // For CTA buttons
    url: String,
    clicked: { type: Boolean, default: false },
  },
  { _id: false },
);

// Message context/reply tracking
const contextSchema = new mongoose.Schema(
  {
    // Reference to previous message this is replying to
    replyToMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MessageLog",
    },
    replyToWaMessageId: String,
    // For forwarding
    forwardedFrom: String,
    forwardedCount: Number,
  },
  { _id: false },
);

// Read receipt details
const readReceiptSchema = new mongoose.Schema(
  {
    readAt: { type: Date, default: Date.now },
    readerType: {
      type: String,
      enum: ["customer", "staff", "system"],
      default: "customer",
    },
    readerId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "readReceipts.readerModel",
    },
    readerModel: {
      type: String,
      enum: ["User", "Customer"],
    },
    deviceInfo: String,
  },
  { _id: false },
);

// Message reaction schema
const reactionSchema = new mongoose.Schema(
  {
    emoji: { type: String, required: true },
    reactedBy: {
      type: String,
      enum: ["customer", "staff"],
    },
    reactedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

// Main message log schema
const messageLogSchema = new mongoose.Schema(
  {
    // Business & Customer References
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },

    // Staff reference (for manual messages)
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Message Type & Direction
    type: {
      type: String,
      enum: [
        // Automated messages
        "booking_confirmation",
        "booking_reminder",
        "booking_cancellation",
        "booking_rescheduled",
        "booking_followup",

        // Campaign messages
        "campaign_winback",
        "campaign_promo",
        "campaign_review",
        "campaign_birthday",
        "campaign_announcement",

        // Manual messages
        "manual",
        "quick_reply",

        // AI messages
        "ai_reply",
        "ai_suggestion", // Suggested but not sent

        // Customer messages
        "inbound",
        "inbound_reply", // Customer replied to us

        // System messages
        "system_notification",
        "error_alert",
      ],
      required: true,
      index: true,
    },
    direction: {
      type: String,
      enum: ["in", "out"],
      required: true,
      index: true,
    },

    // Message Content
    contentType: {
      type: String,
      enum: ["text", "media", "interactive", "template", "location", "contact"],
      default: "text",
    },
    content: {
      type: String,
      required: function () {
        return this.contentType === "text";
      },
      maxlength: [4096, "Message content too long"],
    },

    // Rich Media
    media: mediaSchema,

    // Interactive Elements (buttons, lists)
    interactive: interactiveSchema,

    // WhatsApp Template (if used)
    template: {
      name: String,
      language: String,
      components: [mongoose.Schema.Types.Mixed],
      namespace: String, // For Meta template namespace
    },

    // Message Context (threading)
    context: contextSchema,

    // WhatsApp Metadata
    waMessageId: {
      type: String,
      index: true,
    },
    waBusinessPhone: String, // From which number
    waCustomerPhone: String, // To which number

    // Delivery Status
    status: {
      type: String,
      enum: [
        "pending", // Not sent yet
        "sent", // Accepted by WhatsApp
        "delivered", // Delivered to device
        "read", // Read by recipient
        "failed", // Failed to send
        "bounced", // Invalid number
        "deleted", // Deleted by sender
        "expired", // Media/URL expired
      ],
      default: "pending",
      index: true,
    },

    // Detailed Status Tracking
    statusHistory: [
      {
        status: String,
        timestamp: { type: Date, default: Date.now },
        details: String,
      },
    ],

    // Read Receipts (multiple readers possible)
    readReceipts: [readReceiptSchema],

    // Reactions (emojis)
    reactions: [reactionSchema],

    // Error Tracking
    errorCode: String,
    errorMessage: String,
    failureReason: String,
    retryCount: {
      type: Number,
      default: 0,
    },

    // Campaign Reference
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Campaign",
      default: null,
      index: true,
    },

    // Booking Reference (if related)
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
    },

    // Cost Tracking
    pricing: {
      category: {
        type: String,
        enum: ["utility", "marketing", "authentication", "service"],
        default: "utility",
      },
      cost: {
        type: Number,
        default: 0,
      },
      currency: {
        type: String,
        default: "USD",
      },
      billed: {
        type: Boolean,
        default: false,
      },
    },

    // Timestamps
    sentAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    deliveredAt: Date,
    readAt: Date,
    failedAt: Date,

    // For scheduled messages
    scheduledFor: {
      type: Date,
      default: null,
      index: true,
    },

    // Message lifetime
    expiresAt: Date,

    // Conversation tracking
    conversationId: {
      type: String,
      index: true,
    },
    isFirstMessage: {
      type: Boolean,
      default: false,
    },

    // Analytics flags
    isAutomated: {
      type: Boolean,
      default: true,
    },
    requiredHumanIntervention: {
      type: Boolean,
      default: false,
    },

    // For AI training/improvement
    aiMetadata: {
      model: String, // "claude-3-sonnet"
      confidence: Number,
      intent: String,
      entities: [String],
      sentiment: {
        type: String,
        enum: ["positive", "neutral", "negative"],
      },
      suggestedResponse: String,
      responseTime: Number, // milliseconds
    },

    // GDPR/Compliance
    containsPII: {
      type: Boolean,
      default: false,
    },
    retentionDate: {
      type: Date,
      default: function () {
        return new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days
      },
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.__v;
        // Don't expose internal tracking in API
        delete ret.pricing;
        delete ret.aiMetadata;
        delete ret.statusHistory;
        return ret;
      },
    },
  },
);

// INDEXES

// Primary conversation view (most important)
messageLogSchema.index(
  { businessId: 1, customerId: 1, sentAt: -1 },
  { name: "conversation_view" },
);

// Dashboard inbox (recent messages)
messageLogSchema.index(
  { businessId: 1, sentAt: -1, direction: 1 },
  { name: "inbox_view" },
);

// Unread messages count
messageLogSchema.index(
  { businessId: 1, sentAt: -1 },
  {
    name: "unread_inbound",
    partialFilterExpression: { direction: "in" },
  },
);

// Webhook lookup (CRITICAL for WhatsApp status updates)
messageLogSchema.index(
  { waMessageId: 1 },
  {
    unique: true,
    name: "wa_message_lookup",
    partialFilterExpression: {
      waMessageId: { $type: "string" },
    },
  },
);

// Campaign performance
messageLogSchema.index(
  { campaignId: 1, status: 1, sentAt: -1 },
  { name: "campaign_stats" },
);

// Scheduled messages
messageLogSchema.index(
  { scheduledFor: 1 },
  {
    name: "scheduled_messages",
    partialFilterExpression: { status: "pending" },
  },
);

// Failed messages for retry
messageLogSchema.index(
  { retryCount: 1, failedAt: 1 },
  {
    name: "retry_failed",
    partialFilterExpression: { status: "failed" },
  },
);

// AI training data
messageLogSchema.index(
  { "aiMetadata.intent": 1, "aiMetadata.confidence": 1 },
  { name: "ai_training" },
);

// Analytics queries
messageLogSchema.index(
  { businessId: 1, type: 1, sentAt: -1 },
  { name: "message_analytics" },
);

// Cleanup old messages
messageLogSchema.index(
  { retentionDate: 1 },
  { expireAfterSeconds: 0, name: "auto_cleanup" },
);

// Text search for content
messageLogSchema.index({ content: "text" }, { name: "message_search" });

// MIDDLEWARE

// Pre-save middleware
messageLogSchema.pre("save", async function () {
  // Set conversation ID
  if (!this.conversationId) {
    this.conversationId = `${this.businessId}_${this.customerId}`;
  }

  // Check if first message in conversation
  if (this.isNew) {
    const count = await this.constructor.countDocuments({
      businessId: this.businessId,
      customerId: this.customerId,
    });
    this.isFirstMessage = count === 0;
  }

  // Update status history
  if (this.isModified("status")) {
    this.statusHistory = this.statusHistory || [];
    this.statusHistory.push({
      status: this.status,
      timestamp: new Date(),
      details: this.status === "failed" ? this.failureReason : undefined,
    });
  }

  // Set timestamps based on status
  const now = new Date();
  if (this.status === "sent" && !this.sentAt) {
    this.sentAt = now;
  }
  if (this.status === "delivered" && !this.deliveredAt) {
    this.deliveredAt = now;
  }
  if (this.status === "read" && !this.readAt) {
    this.readAt = now;
  }
  if (this.status === "failed" && !this.failedAt) {
    this.failedAt = now;
  }

  // Detect PII
  this.containsPII = this.detectPII();

  // Set pricing category based on type
  this.setPricingCategory();
});

// Post-save middleware
messageLogSchema.post("save", async function (doc) {
  try {
    // Update customer last interaction
    await mongoose.model("Customer").findByIdAndUpdate(this.customerId, {
      $set: {
        lastInteraction: new Date(),
        "engagement.lastMessageAt": new Date(),
      },
    });

    // Update campaign metrics if applicable
    if (this.campaignId) {
      await mongoose.model("Campaign").findByIdAndUpdate(this.campaignId, {
        $inc: {
          [`metrics.${this.status}`]: 1,
        },
      });
    }

    // Trigger webhook for inbound messages
    if (this.direction === "in" && this.isNew) {
      // Notify staff via socket.io
      // await notifyNewMessage(this);
    }
  } catch (error) {
    console.error("Post-save hook error:", error);
  }
});

// VIRTUALS

messageLogSchema.virtual("isUnread").get(function () {
  if (this.direction !== "in") return false;
  return !this.readReceipts?.some((r) => r.readerType === "staff");
});

messageLogSchema.virtual("preview").get(function () {
  if (this.content) {
    return (
      this.content.substring(0, 100) + (this.content.length > 100 ? "..." : "")
    );
  }
  if (this.media) {
    return `📎 ${this.media.type} message`;
  }
  if (this.interactive) {
    return `🔘 Interactive ${this.interactive.type} message`;
  }
  return "Message";
});

messageLogSchema.virtual("responseTime").get(function () {
  if (this.direction === "out") return null;

  // Find the reply to this message
  return this.aiMetadata?.responseTime || null;
});

messageLogSchema.virtual("isExpired").get(function () {
  return this.expiresAt && this.expiresAt < new Date();
});

// METHODS

// Mark message as read by staff
messageLogSchema.methods.markAsRead = async function (userId) {
  if (this.direction !== "in") return this;

  const alreadyRead = this.readReceipts?.some(
    (r) =>
      r.readerType === "staff" && r.readerId?.toString() === userId?.toString(),
  );

  if (!alreadyRead) {
    this.readReceipts = this.readReceipts || [];
    this.readReceipts.push({
      readAt: new Date(),
      readerType: "staff",
      readerId: userId,
    });

    // Update status if not already read
    if (this.status !== "read") {
      this.status = "read";
    }

    await this.save();
  }

  return this;
};

// Add reaction
messageLogSchema.methods.addReaction = async function (emoji, reactedBy) {
  this.reactions = this.reactions || [];

  // Remove existing reaction from same user
  this.reactions = this.reactions.filter((r) => r.reactedBy !== reactedBy);

  this.reactions.push({ emoji, reactedBy });
  return this.save();
};

// Update from WhatsApp webhook
messageLogSchema.methods.updateFromWebhook = async function (webhookData) {
  const { status, timestamp, error } = webhookData;

  this.status = status;

  if (error) {
    this.errorCode = error.code;
    this.errorMessage = error.message;
    this.failureReason = error.message;
  }

  // Add to status history
  this.statusHistory = this.statusHistory || [];
  this.statusHistory.push({
    status,
    timestamp: new Date(timestamp * 1000),
    details: error?.message,
  });

  return this.save();
};

// Retry failed message
messageLogSchema.methods.retry = async function () {
  if (this.status !== "failed") {
    throw new Error("Only failed messages can be retried");
  }

  if (this.retryCount >= 3) {
    throw new Error("Maximum retry attempts reached");
  }

  this.status = "pending";
  this.retryCount += 1;
  this.scheduledFor = new Date(Date.now() + 60000); // Retry after 1 minute

  return this.save();
};

// Detect PII in content
messageLogSchema.methods.detectPII = function () {
  if (!this.content) return false;

  const piiPatterns = [
    /\d{16}/, // Credit card
    /\d{3}-\d{2}-\d{4}/, // SSN format
    /CNIC|NIC|Passport/i, // Pakistani ID
    /password|secret|token/i,
  ];

  return piiPatterns.some((pattern) => pattern.test(this.content));
};

// Set pricing category
messageLogSchema.methods.setPricingCategory = function () {
  const typeMap = {
    booking_confirmation: "utility",
    booking_reminder: "utility",
    campaign_promo: "marketing",
    campaign_winback: "marketing",
    manual: "service",
    ai_reply: "service",
  };

  this.pricing = this.pricing || {};
  this.pricing.category = typeMap[this.type] || "service";

  // Calculate cost (example rates)
  const rates = {
    utility: 0.0055,
    marketing: 0.0145,
    service: 0.0085,
  };

  this.pricing.cost = rates[this.pricing.category] || 0;
};

// STATICS

// Get conversation history
messageLogSchema.statics.getConversation = function (
  businessId,
  customerId,
  limit = 50,
  before = null,
) {
  const query = { businessId, customerId };
  if (before) {
    query.sentAt = { $lt: before };
  }

  return this.find(query).sort({ sentAt: -1 }).limit(limit).lean();
};

// Get unread count for business
messageLogSchema.statics.getUnreadCount = async function (businessId) {
  const messages = await this.find({
    businessId,
    direction: "in",
  }).select("readReceipts");

  return messages.filter((m) => {
    return !m.readReceipts?.some((r) => r.readerType === "staff");
  }).length;
};

// Find by WhatsApp message ID (for webhooks)
messageLogSchema.statics.findByWaMessageId = function (waMessageId) {
  return this.findOne({ waMessageId });
};

// Get message analytics
messageLogSchema.statics.getAnalytics = async function (
  businessId,
  startDate,
  endDate,
) {
  const match = {
    businessId: new mongoose.Types.ObjectId(businessId),
    sentAt: { $gte: startDate, $lte: endDate },
  };

  const analytics = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          type: "$type",
          direction: "$direction",
          status: "$status",
        },
        count: { $sum: 1 },
        avgResponseTime: {
          $avg: {
            $cond: [
              { $eq: ["$direction", "in"] },
              "$aiMetadata.responseTime",
              null,
            ],
          },
        },
        totalCost: { $sum: "$pricing.cost" },
      },
    },
    {
      $group: {
        _id: "$_id.type",
        directions: {
          $push: {
            direction: "$_id.direction",
            status: "$_id.status",
            count: "$count",
          },
        },
        totalMessages: { $sum: "$count" },
        avgResponseTime: { $avg: "$avgResponseTime" },
        totalCost: { $sum: "$totalCost" },
      },
    },
  ]);

  return analytics;
};

// Bulk delete old messages (GDPR compliance)
messageLogSchema.statics.cleanupOldMessages = async function (daysOld = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const result = await this.deleteMany({
    createdAt: { $lt: cutoffDate },
    retentionDate: { $lt: new Date() },
  });

  return result.deletedCount;
};

// Search messages
messageLogSchema.statics.searchMessages = function (
  businessId,
  query,
  options = {},
) {
  const { limit = 20, type, direction, customerId } = options;

  const filter = { businessId };
  if (type) filter.type = type;
  if (direction) filter.direction = direction;
  if (customerId) filter.customerId = customerId;

  if (query) {
    filter.$text = { $search: query };
  }

  return this.find(filter)
    .sort({ sentAt: -1 })
    .limit(limit)
    .populate("customerId", "name phone")
    .populate("staffId", "name");
};

// Get pending scheduled messages
messageLogSchema.statics.getPendingScheduled = function () {
  return this.find({
    scheduledFor: { $lte: new Date() },
    status: "pending",
  }).sort({ scheduledFor: 1 });
};

const MessageLog = mongoose.model("MessageLog", messageLogSchema);
export default MessageLog;
