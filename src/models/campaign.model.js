import mongoose from "mongoose";

// Individual message tracking per recipient
const campaignMessageSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    customerPhone: {
      type: String,
      required: true,
    },
    customerName: String,

    // Message content (personalized)
    personalizedMessage: String,

    // WhatsApp tracking
    waMessageId: String, // WhatsApp message ID
    templateName: String, // Meta template name

    // Delivery status
    status: {
      type: String,
      enum: [
        "pending", // Not sent yet
        "queued", // In BullMQ queue
        "sent", // API accepted
        "delivered", // WhatsApp delivered
        "read", // Customer read
        "failed", // Delivery failed
        "bounced", // Invalid number
        "opted_out", // Customer unsubscribed
      ],
      default: "pending",
      index: true,
    },

    // Error tracking
    errorCode: String,
    errorMessage: String,

    // Timestamps
    sentAt: Date,
    deliveredAt: Date,
    readAt: Date,
    failedAt: Date,

    // Cost tracking
    cost: {
      type: Number,
      default: 0, // WhatsApp conversation cost
    },

    // Customer action tracking
    customerResponded: {
      type: Boolean,
      default: false,
    },
    responseMessage: String,
    bookedAppointment: {
      type: Boolean,
      default: false,
    },
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
    },
  },
  { _id: false },
);

// Campaign schedule for recurring campaigns
const campaignScheduleSchema = new mongoose.Schema(
  {
    frequency: {
      type: String,
      enum: ["once", "daily", "weekly", "monthly", "custom"],
      default: "once",
    },
    // For weekly: ["mon", "wed", "fri"]
    daysOfWeek: [
      {
        type: String,
        enum: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      },
    ],
    // For monthly: [1, 15, 30]
    daysOfMonth: [Number],
    // Time to send
    timeOfDay: {
      type: String,
      match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format"],
      default: "10:00",
    },
    // Timezone
    timezone: {
      type: String,
      default: "Asia/Karachi",
    },
    // Next scheduled run
    nextRunAt: Date,
    // End recurring
    endAfter: {
      type: Number, // Number of occurrences
      default: null,
    },
    endDate: Date,
    // Track occurrences
    occurrenceCount: {
      type: Number,
      default: 0,
    },
  },
  { _id: false },
);

// A/B Testing variations
const abTestSchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      default: false,
    },
    variations: [
      {
        name: String, // "Version A", "Version B"
        message: String,
        templateName: String,
        recipientCount: {
          type: Number,
          default: 0,
        },
        metrics: {
          sent: { type: Number, default: 0 },
          delivered: { type: Number, default: 0 },
          read: { type: Number, default: 0 },
          responded: { type: Number, default: 0 },
          converted: { type: Number, default: 0 },
        },
      },
    ],
    winningVariation: String, // Name of best performing variation
  },
  { _id: false },
);

// Rate limiting configuration
const rateLimitSchema = new mongoose.Schema(
  {
    messagesPerHour: {
      type: Number,
      default: 100, // WhatsApp business limit
    },
    messagesPerDay: {
      type: Number,
      default: 1000,
    },
    batchSize: {
      type: Number,
      default: 50, // Send in batches of 50
    },
    delayBetweenBatches: {
      type: Number,
      default: 60000, // 1 minute in milliseconds
    },
  },
  { _id: false },
);

// Main campaign schema
const campaignSchema = new mongoose.Schema(
  {
    // Basic Information
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Campaign name is required"],
      trim: true,
      maxlength: [150, "Campaign name cannot exceed 150 characters"],
    },
    description: {
      type: String,
      maxlength: [500, "Description cannot exceed 500 characters"],
    },

    // Campaign Type
    type: {
      type: String,
      enum: [
        "winback", // Inactive customers
        "birthday", // Birthday offers
        "reminder", // Appointment reminders
        "promo", // Promotional offers
        "review", // Review requests
        "announcement", // New service/staff
        "seasonal", // Eid, New Year, etc.
        "follow_up", // Post-service follow up
      ],
      required: [true, "Campaign type is required"],
      index: true,
    },

    // Target Audience
    target: {
      // Tag-based targeting
      tags: [
        {
          type: String,
          enum: ["vip", "new", "inactive", "regular", "at_risk", "lost", "all"],
        },
      ],

      // Custom filters
      filters: {
        minVisits: Number,
        maxVisits: Number,
        minSpent: Number,
        maxSpent: Number,
        lastVisitBefore: Date,
        lastVisitAfter: Date,
        gender: {
          type: String,
          enum: ["male", "female", "other", "all"],
        },
        city: String,
        ageMin: Number,
        ageMax: Number,
      },

      // Customer IDs (for manual selection)
      specificCustomers: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Customer",
        },
      ],

      // Exclude customers
      excludeCustomers: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Customer",
        },
      ],

      // Target size estimate
      estimatedRecipients: {
        type: Number,
        default: 0,
      },
    },

    // WhatsApp Template Information (Meta required)
    whatsappTemplate: {
      templateName: {
        type: String,
        required: [true, "WhatsApp template name is required"],
      },
      templateId: String, // Meta template ID
      language: {
        type: String,
        enum: ["en", "ur"],
        default: "ur",
      },
      category: {
        type: String,
        enum: ["UTILITY", "MARKETING", "AUTHENTICATION"],
        default: "MARKETING",
      },
      // Template components (header, body, footer, buttons)
      components: [
        {
          type: {
            type: String,
            enum: ["HEADER", "BODY", "FOOTER", "BUTTONS"],
          },
          text: String,
          format: String, // TEXT, IMAGE, VIDEO, DOCUMENT
          example: mongoose.Schema.Types.Mixed,
        },
      ],
    },

    // Message Content (with variables)
    message: {
      type: String,
      required: [true, "Message is required"],
      maxlength: [1024, "Message cannot exceed 1024 characters"],
    },
    variables: [
      {
        name: String, // "name", "business", "date", "time"
        description: String,
        defaultValue: String,
      },
    ],

    // Media Attachment (optional)
    media: {
      type: {
        type: String,
        enum: ["image", "video", "document", "none"],
        default: "none",
      },
      url: String,
      caption: String,
      filename: String,
    },

    // Schedule
    schedule: {
      type: campaignScheduleSchema,
      default: () => ({ frequency: "once" }),
    },
    scheduledAt: {
      type: Date,
      default: null,
    },

    // A/B Testing
    abTest: {
      type: abTestSchema,
      default: () => ({ enabled: false }),
    },

    // Rate Limiting
    rateLimit: {
      type: rateLimitSchema,
      default: () => ({}),
    },

    // Status Management
    status: {
      type: String,
      enum: [
        "draft", // Being created
        "scheduled", // Scheduled for future
        "queued", // In queue for processing
        "processing", // Building recipient list
        "sending", // Actively sending
        "paused", // Temporarily paused
        "completed", // Successfully finished
        "failed", // Failed to send
        "cancelled", // Cancelled by user
      ],
      default: "draft",
      index: true,
    },

    // Execution tracking
    execution: {
      startedAt: Date,
      completedAt: Date,
      duration: Number, // milliseconds

      // Batch processing
      currentBatch: { type: Number, default: 0 },
      totalBatches: { type: Number, default: 0 },

      // Job tracking
      jobId: String, // BullMQ job ID
      queueName: String,
    },

    // Recipient tracking (detailed)
    messages: [campaignMessageSchema],

    // Aggregate metrics
    metrics: {
      // Target counts
      totalTargeted: { type: Number, default: 0 },
      eligibleRecipients: { type: Number, default: 0 },

      // Delivery metrics
      sent: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      read: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      bounced: { type: Number, default: 0 },
      optedOut: { type: Number, default: 0 },

      // Engagement metrics
      responded: { type: Number, default: 0 },
      clicked: { type: Number, default: 0 },

      // Conversion metrics (for promo campaigns)
      appointmentsBooked: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 },

      // Rates
      deliveryRate: { type: Number, default: 0 },
      readRate: { type: Number, default: 0 },
      responseRate: { type: Number, default: 0 },
      conversionRate: { type: Number, default: 0 },

      // ROI Calculation
      cost: { type: Number, default: 0 }, // WhatsApp charges
      roi: { type: Number, default: 0 }, // (Revenue - Cost) / Cost * 100
    },

    // Failure tracking
    failureReason: String,
    failureDetails: mongoose.Schema.Types.Mixed,

    // For compliance
    optOutLink: String,

    // Metadata
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    approvedAt: Date,

    // Tags for organization
    tags: [String],

    // Budget tracking
    budget: {
      allocated: Number,
      spent: Number,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        // Don't expose full message array in JSON (too large)
        if (ret.messages && ret.messages.length > 100) {
          ret.messagesSummary = `${ret.messages.length} messages`;
          delete ret.messages;
        }
        return ret;
      },
    },
  },
);

// INDEXES

// Primary indexes
campaignSchema.index({ businessId: 1, status: 1 });
campaignSchema.index({ businessId: 1, type: 1, status: 1 });
campaignSchema.index({ businessId: 1, createdAt: -1 });

// Scheduler indexes
campaignSchema.index({
  status: "scheduled",
  "schedule.nextRunAt": 1,
});
campaignSchema.index({
  "schedule.nextRunAt": 1,
  status: "scheduled",
});

// For recurring campaign management
campaignSchema.index({
  businessId: 1,
  "schedule.frequency": 1,
  status: 1,
});

// Message tracking indexes
campaignSchema.index({ "messages.status": 1 });
campaignSchema.index({ "messages.customerId": 1 });

// Analytics indexes
campaignSchema.index({
  businessId: 1,
  "metrics.sent": -1,
  createdAt: -1,
});

// Text search for campaign name
campaignSchema.index({ name: "text", description: "text" });

// MIDDLEWARE

// Pre-save middleware
campaignSchema.pre("save", async function (next) {
  try {
    // Calculate metrics
    if (this.messages && this.messages.length > 0) {
      this.calculateMetrics();
    }

    // Set next run date for recurring campaigns
    if (this.schedule && this.schedule.frequency !== "once") {
      this.calculateNextRun();
    }

    // Validate template for type
    this.validateTemplateForType();

    next();
  } catch (error) {
    next(error);
  }
});

// Post-save middleware
campaignSchema.post("save", async function (doc) {
  try {
    // Update business campaign count
    if (this.isNew) {
      await mongoose
        .model("Business")
        .updateOne(
          { _id: this.businessId },
          { $inc: { "analytics.totalCampaigns": 1 } },
        );
    }
  } catch (error) {
    console.error("Post-save hook error:", error);
  }
});

// VIRTUALS

campaignSchema.virtual("progress").get(function () {
  if (this.metrics.totalTargeted === 0) return 0;
  return (this.metrics.sent / this.metrics.totalTargeted) * 100;
});

campaignSchema.virtual("isActive").get(function () {
  return ["sending", "processing", "queued"].includes(this.status);
});

campaignSchema.virtual("isRecurring").get(function () {
  return this.schedule && this.schedule.frequency !== "once";
});

campaignSchema.virtual("remainingRecipients").get(function () {
  return this.metrics.totalTargeted - this.metrics.sent;
});

// METHODS

// Calculate all metrics
campaignSchema.methods.calculateMetrics = function () {
  const messages = this.messages || [];

  // Reset metrics
  this.metrics.sent = messages.filter((m) => m.status !== "pending").length;
  this.metrics.delivered = messages.filter(
    (m) => m.status === "delivered",
  ).length;
  this.metrics.read = messages.filter((m) => m.status === "read").length;
  this.metrics.failed = messages.filter((m) => m.status === "failed").length;
  this.metrics.bounced = messages.filter((m) => m.status === "bounced").length;
  this.metrics.optedOut = messages.filter(
    (m) => m.status === "opted_out",
  ).length;
  this.metrics.responded = messages.filter((m) => m.customerResponded).length;
  this.metrics.appointmentsBooked = messages.filter(
    (m) => m.bookedAppointment,
  ).length;

  // Calculate rates
  if (this.metrics.sent > 0) {
    this.metrics.deliveryRate =
      (this.metrics.delivered / this.metrics.sent) * 100;
    this.metrics.readRate = (this.metrics.read / this.metrics.sent) * 100;
    this.metrics.responseRate =
      (this.metrics.responded / this.metrics.sent) * 100;
    this.metrics.conversionRate =
      (this.metrics.appointmentsBooked / this.metrics.sent) * 100;
  }

  // Calculate ROI
  if (this.metrics.cost > 0) {
    this.metrics.roi =
      ((this.metrics.revenue - this.metrics.cost) / this.metrics.cost) * 100;
  }

  return this.metrics;
};

// Calculate next run for recurring campaigns
campaignSchema.methods.calculateNextRun = function () {
  if (!this.schedule) return null;

  const now = new Date();
  let nextRun = new Date(this.schedule.nextRunAt || this.scheduledAt || now);

  switch (this.schedule.frequency) {
    case "daily":
      nextRun.setDate(nextRun.getDate() + 1);
      break;

    case "weekly":
      nextRun.setDate(nextRun.getDate() + 7);
      break;

    case "monthly":
      nextRun.setMonth(nextRun.getMonth() + 1);
      break;

    default:
      return null;
  }

  // Set specific time
  if (this.schedule.timeOfDay) {
    const [hours, minutes] = this.schedule.timeOfDay.split(":");
    nextRun.setHours(parseInt(hours), parseInt(minutes), 0, 0);
  }

  // Check end conditions
  if (this.schedule.endDate && nextRun > this.schedule.endDate) {
    return null;
  }

  if (
    this.schedule.endAfter &&
    this.schedule.occurrenceCount >= this.schedule.endAfter
  ) {
    return null;
  }

  this.schedule.nextRunAt = nextRun;
  return nextRun;
};

// Validate template based on campaign type
campaignSchema.methods.validateTemplateForType = function () {
  const requiredVariables = {
    winback: ["name", "business"],
    birthday: ["name", "discount"],
    reminder: ["name", "date", "time", "service"],
    review: ["name", "business", "link"],
    promo: ["name", "offer"],
  };

  const required = requiredVariables[this.type] || ["name"];

  // Check if template contains required variables
  for (const variable of required) {
    if (!this.message.includes(`{{${variable}}}`)) {
      console.warn(
        `Campaign ${this.name} missing recommended variable: ${variable}`,
      );
    }
  }
};

// Add message to campaign
campaignSchema.methods.addMessage = function (
  customerId,
  customerPhone,
  customerName = "",
) {
  if (!this.messages) this.messages = [];

  // Check if already added
  const exists = this.messages.find(
    (m) => m.customerId.toString() === customerId.toString(),
  );
  if (exists) return exists;

  const personalizedMessage = this.personalizeMessage(customerName);

  const message = {
    customerId,
    customerPhone,
    customerName,
    personalizedMessage,
    status: "pending",
  };

  this.messages.push(message);
  this.metrics.totalTargeted = this.messages.length;

  return message;
};

// Personalize message for customer
campaignSchema.methods.personalizeMessage = function (customerName = "") {
  let message = this.message;

  // Replace variables
  message = message.replace(/{{name}}/g, customerName || "Valued Customer");
  message = message.replace(
    /{{business}}/g,
    this.businessName || "Our Business",
  );
  message = message.replace(/{{date}}/g, new Date().toLocaleDateString());
  message = message.replace(/{{time}}/g, new Date().toLocaleTimeString());

  return message;
};

// Update message status
campaignSchema.methods.updateMessageStatus = async function (
  customerId,
  status,
  waMessageId = null,
  errorDetails = null,
) {
  const message = this.messages.find(
    (m) => m.customerId.toString() === customerId.toString(),
  );

  if (!message) return null;

  message.status = status;
  message.waMessageId = waMessageId;

  // Set timestamps
  const now = new Date();
  switch (status) {
    case "sent":
      message.sentAt = now;
      break;
    case "delivered":
      message.deliveredAt = now;
      break;
    case "read":
      message.readAt = now;
      break;
    case "failed":
      message.failedAt = now;
      message.errorMessage = errorDetails;
      break;
  }

  // Recalculate metrics
  this.calculateMetrics();

  // Update campaign status if complete
  if (this.metrics.sent >= this.metrics.totalTargeted) {
    this.status = "completed";
    this.execution.completedAt = now;
  }

  return this.save();
};

// Pause campaign
campaignSchema.methods.pause = async function () {
  if (this.status !== "sending") {
    throw new Error("Only sending campaigns can be paused");
  }

  this.status = "paused";
  return this.save();
};

// Resume campaign
campaignSchema.methods.resume = async function () {
  if (this.status !== "paused") {
    throw new Error("Only paused campaigns can be resumed");
  }

  this.status = "sending";
  return this.save();
};

// Cancel campaign
campaignSchema.methods.cancel = async function (reason = "User cancelled") {
  if (["completed", "cancelled"].includes(this.status)) {
    throw new Error("Cannot cancel completed or already cancelled campaign");
  }

  this.status = "cancelled";
  this.failureReason = reason;

  // Remove from queue if job exists
  if (this.execution.jobId) {
    // BullMQ job removal logic here
  }

  return this.save();
};

// Clone campaign
campaignSchema.methods.clone = function (newName = null) {
  const cloned = this.toObject();
  delete cloned._id;
  delete cloned.createdAt;
  delete cloned.updatedAt;
  delete cloned.messages;
  delete cloned.metrics;
  delete cloned.execution;

  cloned.name = newName || `${this.name} (Copy)`;
  cloned.status = "draft";
  cloned.scheduledAt = null;

  return new this.constructor(cloned);
};

// STATICS

// Find campaigns ready to send
campaignSchema.statics.findReadyToSend = function () {
  const now = new Date();

  return this.find({
    status: "scheduled",
    $or: [
      { scheduledAt: { $lte: now } },
      { "schedule.nextRunAt": { $lte: now } },
    ],
  }).populate("businessId", "name whatsapp");
};

// Find active campaigns for a business
campaignSchema.statics.getActiveCampaigns = function (businessId) {
  return this.find({
    businessId,
    status: { $in: ["sending", "processing", "queued"] },
  }).sort({ createdAt: -1 });
};

// Get campaign analytics
campaignSchema.statics.getAnalytics = async function (businessId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const campaigns = await this.find({
    businessId,
    createdAt: { $gte: startDate },
    status: "completed",
  });

  return {
    totalCampaigns: campaigns.length,
    totalMessages: campaigns.reduce((sum, c) => sum + c.metrics.sent, 0),
    averageDeliveryRate:
      campaigns.reduce((sum, c) => sum + c.metrics.deliveryRate, 0) /
      campaigns.length,
    averageReadRate:
      campaigns.reduce((sum, c) => sum + c.metrics.readRate, 0) /
      campaigns.length,
    totalRevenue: campaigns.reduce((sum, c) => sum + c.metrics.revenue, 0),
    totalROI:
      campaigns.reduce((sum, c) => sum + c.metrics.roi, 0) / campaigns.length,
    bestPerforming: campaigns.sort(
      (a, b) => b.metrics.conversionRate - a.metrics.conversionRate,
    )[0],
  };
};

// Find campaigns by type
campaignSchema.statics.findByType = function (businessId, type, status = null) {
  const query = { businessId, type };
  if (status) query.status = status;

  return this.find(query).sort({ createdAt: -1 });
};

const Campaign = mongoose.model("Campaign", campaignSchema);
export default Campaign;
