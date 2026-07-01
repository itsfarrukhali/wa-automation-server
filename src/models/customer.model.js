import mongoose from "mongoose";

// Custom fields schema
const customFieldSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    value: mongoose.Schema.Types.Mixed,
    type: {
      type: String,
      enum: ["text", "number", "date", "boolean", "select"],
      default: "text",
    },
  },
  { _id: false },
);

// Interaction history for campaign tracking
const interactionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "whatsapp_sent",
        "whatsapp_delivered",
        "whatsapp_read",
        "whatsapp_replied",
        "appointment_booked",
        "appointment_completed",
        "appointment_cancelled",
        "review_requested",
        "review_received",
        "campaign_clicked",
      ],
      required: true,
    },
    messageId: String, // WhatsApp message ID
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign" },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment" },
    metadata: mongoose.Schema.Types.Mixed,
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false },
);

// Customer segments for advanced targeting
const segmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    joinedAt: { type: Date, default: Date.now },
    source: {
      type: String,
      enum: ["manual", "auto_inactive", "auto_vip", "auto_new", "campaign"],
      default: "manual",
    },
  },
  { _id: false },
);

const customerSchema = new mongoose.Schema(
  {
    // Business reference
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },

    // Basic Information
    name: {
      type: String,
      required: [true, "Customer name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
      index: true,
    },

    // Contact Information
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
      validate: {
        validator: function (v) {
          // Pakistani and international format
          return /^(\+92|0)?3[0-9]{2}[0-9]{7}$/.test(v.replace(/[-\s]/g, ""));
        },
        message: "Invalid Pakistani phone number",
      },
    },

    // WhatsApp specific contact
    whatsappNumber: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          if (!v) return true;
          return /^(\+92|0)?3[0-9]{2}[0-9]{7}$/.test(v.replace(/[-\s]/g, ""));
        },
        message: "Invalid WhatsApp number",
      },
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email format"],
      sparse: true, // Allow multiple nulls
    },

    // WhatsApp Profile (from Meta webhook)
    waProfileName: {
      type: String,
      default: null,
    },
    waProfilePicture: {
      type: String,
      default: null,
    },

    // Personal Information (for special offers)
    birthdate: {
      type: Date,
      validate: {
        validator: function (v) {
          return !v || v < new Date();
        },
        message: "Birthdate cannot be in future",
      },
    },
    anniversary: Date,
    gender: {
      type: String,
      enum: ["male", "female", "other", "prefer_not_to_say"],
    },

    // Source Tracking
    source: {
      type: String,
      enum: [
        "manual",
        "walk_in",
        "whatsapp",
        "phone_call",
        "website",
        "facebook",
        "instagram",
        "google",
        "referral",
        "import",
        "other",
      ],
      default: "manual",
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
    },

    // Address
    address: {
      street: String,
      area: String,
      city: String,
      landmark: String,
    },

    // Preferences
    preferences: {
      language: {
        type: String,
        enum: ["ur", "en", "auto"],
        default: "auto", // Auto-detect from messages
      },
      preferredContactTime: {
        type: String,
        enum: ["morning", "afternoon", "evening", "any"],
        default: "any",
      },
      preferredServices: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Service",
        },
      ],
      preferredStaff: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },

    // Tags & Segmentation
    tags: {
      type: [String],
      enum: ["vip", "new", "inactive", "regular", "whale", "at_risk", "lost"],
      default: ["new"],
      index: true,
    },
    segments: [segmentSchema],

    // Visit & Spend Metrics
    lastVisit: {
      type: Date,
      default: null,
      index: true,
    },
    firstVisit: {
      type: Date,
      default: Date.now,
    },
    totalVisits: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalSpent: {
      type: Number,
      default: 0,
      min: 0,
    },
    averageSpendPerVisit: {
      type: Number,
      default: 0,
    },

    // Appointment Metrics
    totalAppointments: {
      type: Number,
      default: 0,
    },
    completedAppointments: {
      type: Number,
      default: 0,
    },
    cancelledAppointments: {
      type: Number,
      default: 0,
    },
    noShowCount: {
      type: Number,
      default: 0,
    },

    // Engagement Metrics (for campaign effectiveness)
    engagement: {
      score: {
        type: Number,
        default: 50, // 0-100
        min: 0,
        max: 100,
      },
      lastMessageSent: Date,
      lastMessageDelivered: Date,
      lastMessageRead: Date,
      lastReplied: Date,
      totalMessagesSent: { type: Number, default: 0 },
      totalMessagesRead: { type: Number, default: 0 },
      replyRate: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
      },
    },

    // Campaign Tracking
    campaignHistory: [
      {
        campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign" },
        sentAt: Date,
        status: {
          type: String,
          enum: ["sent", "delivered", "read", "replied", "failed"],
        },
        response: String,
      },
    ],

    // Recent Interactions (last 50)
    interactions: {
      type: [interactionSchema],
      default: [],
      select: false,
    },

    // Communication Preferences
    optedOut: {
      type: Boolean,
      default: false,
      index: true,
    },
    optedOutAt: Date,
    optOutReason: {
      type: String,
      enum: ["user_request", "spam_report", "inactive", "manual"],
    },

    // WhatsApp specific opt-outs
    waOptOutCategories: [
      {
        type: String,
        enum: ["marketing", "reminders", "promotions", "newsletter"],
      },
    ],

    // Custom Fields
    customFields: [customFieldSchema],

    // Notes
    notes: {
      type: String,
      maxlength: [1000, "Notes cannot exceed 1000 characters"],
      default: "",
    },
    privateNotes: {
      type: String,
      maxlength: [2000],
      select: false,
    },

    // Status
    status: {
      type: String,
      enum: ["active", "inactive", "blocked", "deleted"],
      default: "active",
      index: true,
    },

    // GDPR/Privacy
    consentGiven: {
      type: Boolean,
      default: false,
    },
    whatsappOptIn: {
      type: Boolean,
      default: true,
      index: true,
    },
    consentDate: Date,
    dataRetentionDate: {
      type: Date,
      default: () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },

    // Metadata
    importedFrom: String, // If imported from CSV/Excel
    importBatchId: String,
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        delete ret.privateNotes;
        delete ret.interactions;
        return ret;
      },
    },
    toObject: {
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  },
);

// INDEXES

// Primary unique constraint
customerSchema.index(
  { businessId: 1, phone: 1 },
  { unique: true, name: "business_phone_unique" },
);

// For searching customers
customerSchema.index({ businessId: 1, name: 1 });
customerSchema.index({ businessId: 1, "preferences.preferredStaff": 1 });

// For campaign targeting
customerSchema.index({ businessId: 1, tags: 1, optedOut: 1 });
customerSchema.index({ businessId: 1, "engagement.score": -1 });
customerSchema.index({ businessId: 1, lastVisit: -1 });

// For inactive customer detection
customerSchema.index({
  businessId: 1,
  lastVisit: 1,
  optedOut: 1,
  status: 1,
});

// For WhatsApp message targeting
customerSchema.index({
  businessId: 1,
  optedOut: 1,
  waOptOutCategories: 1,
});

// Text search for name and phone
customerSchema.index({ name: "text", phone: "text" });

// MIDDLEWARE

// Pre-save hooks
customerSchema.pre("save", function () {
  if (this.phone) {
    this.phone = this.formatPhoneNumber(this.phone);
  }
  if (this.whatsappNumber) {
    this.whatsappNumber = this.formatPhoneNumber(this.whatsappNumber);
  }

  if (!this.whatsappNumber && this.phone) {
    this.whatsappNumber = this.phone;
  }

  this.optedOut = !this.whatsappOptIn;
  this.averageSpendPerVisit =
    this.totalVisits > 0 ? this.totalSpent / this.totalVisits : 0;
  this.calculateEngagementScore();
  this.autoTag();
  this.updateStatus();
});

// VIRTUALS

customerSchema.virtual("fullAddress").get(function () {
  if (!this.address) return null;
  return [this.address.street, this.address.area, this.address.city]
    .filter(Boolean)
    .join(", ");
});

customerSchema.virtual("isInactive").get(function () {
  if (!this.lastVisit) return false;
  const daysSinceLastVisit =
    (Date.now() - this.lastVisit) / (1000 * 60 * 60 * 24);
  return daysSinceLastVisit > 30;
});

customerSchema.virtual("customerLifetimeValue").get(function () {
  const monthsSinceFirstVisit = this.firstVisit
    ? Math.max(1, (Date.now() - this.firstVisit) / (1000 * 60 * 60 * 24 * 30))
    : 1;
  return this.totalSpent / monthsSinceFirstVisit;
});

customerSchema.virtual("nextBirthday").get(function () {
  if (!this.birthdate) return null;
  const today = new Date();
  const birthdate = new Date(this.birthdate);
  birthdate.setFullYear(today.getFullYear());
  if (birthdate < today) {
    birthdate.setFullYear(today.getFullYear() + 1);
  }
  return birthdate;
});

// METHODS

// Phone number formatting (Pakistani standard)
customerSchema.methods.formatPhoneNumber = function (phone) {
  if (!phone) return phone;

  // Remove all non-digits
  let cleaned = phone.replace(/\D/g, "");

  // Handle Pakistani numbers
  if (cleaned.startsWith("92")) {
    cleaned = "+" + cleaned;
  } else if (cleaned.startsWith("0")) {
    cleaned = "+92" + cleaned.substring(1);
  } else if (cleaned.length === 10 && cleaned.startsWith("3")) {
    cleaned = "+92" + cleaned;
  }

  return cleaned;
};

// Calculate engagement score (0-100)
customerSchema.methods.calculateEngagementScore = function () {
  let score = 50; // Base score

  // Recent visits (last 30 days)
  if (this.lastVisit) {
    const daysSinceVisit =
      (Date.now() - this.lastVisit) / (1000 * 60 * 60 * 24);
    if (daysSinceVisit <= 7) score += 20;
    else if (daysSinceVisit <= 30) score += 10;
    else if (daysSinceVisit > 90) score -= 20;
  }

  // Visit frequency
  if (this.totalVisits >= 10) score += 15;
  else if (this.totalVisits >= 5) score += 8;
  else if (this.totalVisits === 0) score -= 10;

  // Spending
  if (this.averageSpendPerVisit > 5000) score += 10;
  else if (this.averageSpendPerVisit > 2000) score += 5;

  // WhatsApp engagement
  if (this.engagement.replyRate > 50) score += 10;
  else if (this.engagement.replyRate > 20) score += 5;

  // Opt-out penalty
  if (this.optedOut) score = 0;

  // No-shows penalty
  if (this.noShowCount > 2) score -= 15;
  else if (this.noShowCount > 0) score -= 5;

  this.engagement.score = Math.max(0, Math.min(100, score));
  return this.engagement.score;
};

// Auto-tag based on behavior
customerSchema.methods.autoTag = function () {
  const tags = new Set(this.tags || []);

  // Remove old auto-tags
  tags.delete("new");
  tags.delete("inactive");
  tags.delete("at_risk");
  tags.delete("lost");

  // New customer (less than 30 days)
  const daysSinceFirst = (Date.now() - this.firstVisit) / (1000 * 60 * 60 * 24);
  if (daysSinceFirst <= 30) {
    tags.add("new");
  }

  // VIP (high spender or frequent visitor)
  if (this.totalSpent >= 50000 || this.totalVisits >= 20) {
    tags.add("vip");
  }

  // Inactive (no visit in 30-90 days)
  if (this.lastVisit) {
    const daysSinceLast = (Date.now() - this.lastVisit) / (1000 * 60 * 60 * 24);
    if (daysSinceLast > 90) {
      tags.add("lost");
    } else if (daysSinceLast > 60) {
      tags.add("at_risk");
    } else if (daysSinceLast > 30) {
      tags.add("inactive");
    } else {
      tags.add("regular");
    }
  }

  this.tags = Array.from(tags);
  return this.tags;
};

// Update status based on activity
customerSchema.methods.updateStatus = function () {
  if (this.status === "blocked" || this.status === "deleted") return;

  if (this.optedOut) {
    this.status = "inactive";
    return;
  }

  if (this.lastVisit) {
    const daysSinceLast = (Date.now() - this.lastVisit) / (1000 * 60 * 60 * 24);
    if (daysSinceLast > 365) {
      this.status = "inactive";
    } else {
      this.status = "active";
    }
  } else {
    this.status = "active";
  }
};

// Record a visit
customerSchema.methods.recordVisit = async function (visitData = {}) {
  this.lastVisit = new Date();
  this.totalVisits += 1;

  if (visitData.amount) {
    this.totalSpent += visitData.amount;
  }

  // Add interaction
  this.interactions.push({
    type: "appointment_completed",
    appointmentId: visitData.appointmentId,
    metadata: { amount: visitData.amount },
    timestamp: new Date(),
  });

  // Keep only last 50 interactions
  if (this.interactions.length > 50) {
    this.interactions = this.interactions.slice(-50);
  }

  return this.save();
};

// Track WhatsApp message
customerSchema.methods.trackWhatsAppMessage = async function (messageData) {
  const { type, messageId, campaignId, status } = messageData;

  // Update engagement metrics
  this.engagement.lastMessageSent = new Date();
  this.engagement.totalMessagesSent += 1;

  if (status === "delivered") {
    this.engagement.lastMessageDelivered = new Date();
  }
  if (status === "read") {
    this.engagement.lastMessageRead = new Date();
    this.engagement.totalMessagesRead += 1;
    this.engagement.replyRate =
      (this.engagement.totalMessagesRead / this.engagement.totalMessagesSent) *
      100;
  }

  // Add to interactions
  this.interactions.push({
    type: `whatsapp_${type}`,
    messageId,
    campaignId,
    timestamp: new Date(),
  });

  // Keep only last 50
  if (this.interactions.length > 50) {
    this.interactions = this.interactions.slice(-50);
  }

  this.markModified("interactions");
  return this.save();
};

// Opt-out from WhatsApp
customerSchema.methods.optOut = async function (
  reason = "user_request",
  categories = [],
) {
  this.optedOut = true;
  this.whatsappOptIn = false;
  this.optedOutAt = new Date();
  this.optOutReason = reason;

  if (categories.length > 0) {
    this.waOptOutCategories = categories;
  }

  return this.save();
};

// Opt-in again
customerSchema.methods.optIn = async function () {
  this.optedOut = false;
  this.whatsappOptIn = true;
  this.optedOutAt = null;
  this.optOutReason = null;
  this.waOptOutCategories = [];
  return this.save();
};

// Add to segment
customerSchema.methods.addToSegment = function (
  segmentName,
  source = "manual",
) {
  const existingSegment = this.segments.find((s) => s.name === segmentName);
  if (!existingSegment) {
    this.segments.push({ name: segmentName, source, joinedAt: new Date() });
  }
};

// Remove from segment
customerSchema.methods.removeFromSegment = function (segmentName) {
  this.segments = this.segments.filter((s) => s.name !== segmentName);
};

// Get communication language
customerSchema.methods.getPreferredLanguage = function () {
  if (this.preferences.language !== "auto") {
    return this.preferences.language;
  }
  // TODO: Auto-detect (can be enhanced with actual detection logic based on messages)
  return "ur"; // Default for Pakistan
};

// STATICS

// Find inactive customers for win-back campaign
customerSchema.statics.findInactiveCustomers = function (
  businessId,
  daysInactive = 30,
) {
  const cutoffDate = new Date(Date.now() - daysInactive * 24 * 60 * 60 * 1000);

  return this.find({
    businessId,
    optedOut: false,
    status: "active",
    $or: [
      { lastVisit: { $lt: cutoffDate } },
      { lastVisit: null, firstVisit: { $lt: cutoffDate } },
    ],
  });
};

// Find VIP customers
customerSchema.statics.findVIPCustomers = function (
  businessId,
  minSpent = 50000,
) {
  return this.find({
    businessId,
    optedOut: false,
    totalSpent: { $gte: minSpent },
  }).sort({ totalSpent: -1 });
};

// Find customers with upcoming birthdays
customerSchema.statics.findUpcomingBirthdays = function (
  businessId,
  daysAhead = 7,
) {
  const today = new Date();
  const future = new Date(today);
  future.setDate(today.getDate() + daysAhead);

  // Complex query for birthday within date range
  return this.find({
    businessId,
    optedOut: false,
    birthdate: { $exists: true, $ne: null },
  }).then((customers) => {
    return customers.filter((customer) => {
      const birthday = new Date(customer.birthdate);
      const thisYearBirthday = new Date(
        today.getFullYear(),
        birthday.getMonth(),
        birthday.getDate(),
      );
      return thisYearBirthday >= today && thisYearBirthday <= future;
    });
  });
};

// Bulk import customers
customerSchema.statics.bulkImport = async function (
  businessId,
  customers,
  importBatchId,
) {
  const formatted = customers.map((c) => ({
    ...c,
    businessId,
    importBatchId,
    source: "import",
    phone: this.prototype.formatPhoneNumber(c.phone),
  }));

  try {
    const result = await this.insertMany(formatted, { ordered: false });
    return { success: result.length, failed: customers.length - result.length };
  } catch (error) {
    // Handle duplicate errors gracefully
    if (error.writeErrors) {
      const inserted = customers.length - error.writeErrors.length;
      return { success: inserted, failed: error.writeErrors.length };
    }
    throw error;
  }
};

const Customer = mongoose.model("Customer", customerSchema);
export default Customer;
