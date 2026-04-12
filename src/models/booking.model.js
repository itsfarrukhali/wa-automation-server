import mongoose from "mongoose";

const whatsappTrackingSchema = new mongoose.Schema(
  {
    // Confirmation message
    confirmation: {
      messageId: String,
      sentAt: Date,
      deliveredAt: Date,
      readAt: Date,
      status: {
        type: String,
        enum: ["pending", "sent", "delivered", "read", "failed"],
        default: "pending",
      },
      template: String, // Which template was used
    },

    // Reminder message
    reminder: {
      messageId: String,
      scheduledFor: Date, // When should we send
      sentAt: Date,
      deliveredAt: Date,
      readAt: Date,
      status: {
        type: String,
        enum: ["pending", "scheduled", "sent", "delivered", "read", "failed"],
        default: "pending",
      },
      reminderType: {
        type: String,
        enum: ["24h", "2h", "custom"],
        default: "24h",
      },
    },

    // Follow-up message
    followUp: {
      messageId: String,
      scheduledFor: Date,
      sentAt: Date,
      deliveredAt: Date,
      readAt: Date,
      status: {
        type: String,
        enum: ["pending", "scheduled", "sent", "delivered", "read", "failed"],
        default: "pending",
      },
    },

    // Review request
    reviewRequest: {
      messageId: String,
      sentAt: Date,
      deliveredAt: Date,
      readAt: Date,
      clickedAt: Date, // Customer clicked review link
      reviewedAt: Date, // Actually left review
      reviewLink: String,
      platform: {
        type: String,
        enum: ["google", "facebook", "custom", "internal"],
        default: "google",
      },
      rating: {
        type: Number,
        min: 1,
        max: 5,
      },
      reviewText: String,
      status: {
        type: String,
        enum: ["pending", "sent", "clicked", "reviewed", "skipped"],
        default: "pending",
      },
    },
  },
  { _id: false },
);

// Schedule conflict detection
const timeSlotSchema = new mongoose.Schema(
  {
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    duration: { type: Number, required: true }, // minutes
    bufferBefore: { type: Number, default: 5 }, // minutes
    bufferAfter: { type: Number, default: 5 }, // minutes
  },
  { _id: false },
);

// Payment installments
const paymentInstallmentSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true },
    method: {
      type: String,
      enum: ["cash", "card", "jazzcash", "easypaisa", "bank_transfer"],
      required: true,
    },
    paidAt: { type: Date, default: Date.now },
    reference: String, // Transaction ID
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    notes: String,
  },
  { _id: true },
);

// Main booking schema
const bookingSchema = new mongoose.Schema(
  {
    // Basic References
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
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: true,
    },
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    // Schedule Information
    scheduledAt: {
      type: Date,
      required: [true, "Scheduled time is required"],
      validate: {
        validator: function (v) {
          return v > new Date();
        },
        message: "Scheduled time must be in the future",
      },
    },

    // Service details (denormalized for quick access)
    serviceDetails: {
      name: { type: String, required: true },
      duration: { type: Number, required: true }, // minutes
      price: { type: Number, required: true },
      category: String,
    },

    // Time slot with buffers
    timeSlot: {
      type: timeSlotSchema, // ✅ Using the schema here
      default: null,
    },
    // Customer details (denormalized)
    customerDetails: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      whatsappNumber: String,
    },

    // Staff details (denormalized)
    staffDetails: {
      name: String,
      phone: String,
    },

    // Status Management
    status: {
      type: String,
      enum: [
        "pending", // Initial state
        "confirmed", // Customer confirmed
        "arrived", // Customer arrived
        "in_progress", // Service started
        "completed", // Service done
        "no_show", // Customer didn't come
        "cancelled", // Cancelled
        "rescheduled", // Moved to another time
      ],
      default: "pending",
      index: true,
    },

    // Status history for analytics
    statusHistory: [
      {
        status: String,
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        reason: String,
      },
    ],

    // WhatsApp Communication Tracking
    whatsapp: {
      type: whatsappTrackingSchema,
      default: () => ({}),
    },

    // Legacy reminder tracking (for backward compatibility)
    reminderSent: {
      type: Boolean,
      default: false,
    },
    reminderSentAt: Date,

    // Follow-up tracking
    followUpSent: {
      type: Boolean,
      default: false,
    },
    followUpSentAt: Date,

    // Review tracking
    reviewRequested: {
      type: Boolean,
      default: false,
    },
    reviewCompleted: {
      type: Boolean,
      default: false,
    },

    // Payment Information
    paymentStatus: {
      type: String,
      enum: ["unpaid", "partial", "paid", "refunded", "waived"],
      default: "unpaid",
      index: true,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    amountPaid: {
      type: Number,
      default: 0,
      min: 0,
    },
    amountDue: {
      type: Number,
      default: function () {
        return this.totalAmount - this.amountPaid;
      },
    },

    // Payment installments (for advance + remaining)
    payments: [paymentInstallmentSchema],

    // Pakistani payment methods
    preferredPaymentMethod: {
      type: String,
      enum: ["cash", "card", "jazzcash", "easypaisa", "bank_transfer"],
      default: "cash",
    },

    // Discount/Coupon
    discount: {
      code: String,
      amount: { type: Number, default: 0 },
      type: { type: String, enum: ["percentage", "fixed"] },
    },

    // Notes & Special Requests
    notes: {
      type: String,
      maxlength: [500, "Notes cannot exceed 500 characters"],
      default: "",
    },
    internalNotes: {
      type: String,
      maxlength: [1000],
      select: false, // Staff only
    },
    specialRequests: String,

    // Cancellation Information
    cancellationReason: {
      type: String,
      enum: [
        "customer_request",
        "staff_unavailable",
        "weather",
        "emergency",
        "double_booked",
        "payment_issue",
        "other",
      ],
    },
    cancellationNotes: String,
    cancelledAt: Date,
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // Rescheduling Information
    rescheduledFrom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
    },
    rescheduledTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
    },
    rescheduleCount: {
      type: Number,
      default: 0,
    },

    // No-Show Information
    noShowFee: {
      charged: { type: Boolean, default: false },
      amount: Number,
      paid: { type: Boolean, default: false },
    },

    // Customer Feedback
    feedback: {
      rating: { type: Number, min: 1, max: 5 },
      comment: String,
      submittedAt: Date,
      categories: [String], // ["service_quality", "staff_behavior", "cleanliness"]
    },

    // Source tracking
    source: {
      type: String,
      enum: [
        "whatsapp",
        "phone",
        "walk_in",
        "website",
        "app",
        "staff",
        "other",
      ],
      default: "whatsapp",
    },

    // Recurring booking reference
    recurringGroupId: {
      type: String,
      index: true,
    },

    // Metadata
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // For soft delete
    deletedAt: Date,
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.__v;
        delete ret.internalNotes;
        return ret;
      },
    },
    toObject: {
      transform(_doc, ret) {
        delete ret.__v;
        delete ret.internalNotes;
        return ret;
      },
    },
  },
);

// INDEXES

// Primary indexes for scheduler
bookingSchema.index({ businessId: 1, scheduledAt: 1 });
bookingSchema.index({ businessId: 1, status: 1, scheduledAt: 1 });
bookingSchema.index({ customerId: 1, scheduledAt: -1 });

// For reminder sending (CRITICAL for Zario)
bookingSchema.index({
  businessId: 1,
  scheduledAt: 1,
  status: 1,
  "whatsapp.reminder.scheduledFor": 1,
  "whatsapp.reminder.status": 1,
});

// For follow-up messages
bookingSchema.index({
  businessId: 1,
  status: 1,
  "whatsapp.followUp.scheduledFor": 1,
  "whatsapp.followUp.status": 1,
});

// For review requests
bookingSchema.index({
  businessId: 1,
  status: "completed",
  "whatsapp.reviewRequest.status": 1,
});

// For staff schedule
bookingSchema.index({ staffId: 1, scheduledAt: 1 });
bookingSchema.index({ businessId: 1, staffId: 1, scheduledAt: 1 });

// For conflict detection
bookingSchema.index({
  businessId: 1,
  staffId: 1,
  "timeSlot.startTime": 1,
  "timeSlot.endTime": 1,
});

// For payment tracking
bookingSchema.index({ businessId: 1, paymentStatus: 1 });
bookingSchema.index({ businessId: 1, scheduledAt: 1, paymentStatus: 1 });

// For recurring bookings
bookingSchema.index({ recurringGroupId: 1 });

// For date-based reports
bookingSchema.index({ businessId: 1, createdAt: -1 });
bookingSchema.index({ scheduledAt: 1, status: 1 });

// MIDDLEWARE

// Pre-save middleware
bookingSchema.pre("save", async function (next) {
  try {
    // Calculate time slot with buffers
    if (this.scheduledAt && this.serviceDetails?.duration) {
      const startTime = new Date(this.scheduledAt);
      const endTime = new Date(
        startTime.getTime() + this.serviceDetails.duration * 60000,
      );

      this.timeSlot = {
        startTime,
        endTime,
        duration: this.serviceDetails.duration,
        bufferBefore: this.timeSlot?.bufferBefore || 5,
        bufferAfter: this.timeSlot?.bufferAfter || 5,
      };
    }

    // Calculate amount due
    this.amountDue = this.totalAmount - this.amountPaid;

    // Update payment status based on amount
    if (this.amountPaid >= this.totalAmount && this.totalAmount > 0) {
      this.paymentStatus = "paid";
    } else if (this.amountPaid > 0) {
      this.paymentStatus = "partial";
    }

    // Track status changes
    if (this.isModified("status")) {
      this.statusHistory = this.statusHistory || [];
      this.statusHistory.push({
        status: this.status,
        changedAt: new Date(),
        changedBy: this.updatedBy,
        reason:
          this.status === "cancelled" ? this.cancellationReason : undefined,
      });
    }

    // Set reminder scheduled time (24 hours before)
    if (this.status === "confirmed" && !this.whatsapp?.reminder?.scheduledFor) {
      const reminderTime = new Date(this.scheduledAt);
      reminderTime.setHours(reminderTime.getHours() - 24);

      if (!this.whatsapp) this.whatsapp = {};
      if (!this.whatsapp.reminder) {
        this.whatsapp.reminder = {
          scheduledFor: reminderTime,
          status: "scheduled",
          reminderType: "24h",
        };
      }
    }

    // Set follow-up scheduled time (after service)
    if (this.status === "completed" && !this.whatsapp?.followUp?.scheduledFor) {
      const followUpTime = new Date();
      followUpTime.setHours(followUpTime.getHours() + 2); // 2 hours after completion

      if (!this.whatsapp) this.whatsapp = {};
      if (!this.whatsapp.followUp) {
        this.whatsapp.followUp = {
          scheduledFor: followUpTime,
          status: "scheduled",
        };
      }
    }

    // Validate no conflicts (if staff assigned)
    if (this.isModified("scheduledAt") || this.isModified("staffId")) {
      await this.checkForConflicts();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Post-save middleware
bookingSchema.post("save", async function (doc) {
  try {
    // Update customer metrics
    if (this.status === "completed") {
      await mongoose.model("Customer").findByIdAndUpdate(this.customerId, {
        $inc: {
          totalVisits: 1,
          totalSpent: this.totalAmount,
          totalAppointments: 1,
          completedAppointments: 1,
        },
        $set: { lastVisit: new Date() },
      });
    } else if (this.isNew) {
      await mongoose
        .model("Customer")
        .findByIdAndUpdate(this.customerId, { $inc: { totalAppointments: 1 } });
    }

    // Update business analytics
    await mongoose.model("Business").findByIdAndUpdate(this.businessId, {
      $inc: {
        "analytics.totalAppointments": this.isNew ? 1 : 0,
        "analytics.totalRevenue":
          this.status === "completed" ? this.totalAmount : 0,
      },
    });
  } catch (error) {
    console.error("Post-save hook error:", error);
  }
});

// VIRTUALS

bookingSchema.virtual("isUpcoming").get(function () {
  return (
    this.scheduledAt > new Date() &&
    ["pending", "confirmed"].includes(this.status)
  );
});

bookingSchema.virtual("isPast").get(function () {
  return this.scheduledAt < new Date();
});

bookingSchema.virtual("isToday").get(function () {
  const today = new Date();
  const bookingDate = new Date(this.scheduledAt);
  return bookingDate.toDateString() === today.toDateString();
});

bookingSchema.virtual("timeUntilAppointment").get(function () {
  const now = new Date();
  const diff = this.scheduledAt - now;

  if (diff < 0) return "Past";

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? "s" : ""}`;
  }

  return `${hours}h ${minutes}m`;
});

bookingSchema.virtual("customerName").get(function () {
  return this.customerDetails?.name || "Unknown";
});

bookingSchema.virtual("serviceName").get(function () {
  return this.serviceDetails?.name || "Unknown";
});

bookingSchema.virtual("canSendReminder").get(function () {
  if (!this.isUpcoming) return false;
  if (this.whatsapp?.reminder?.status === "sent") return false;

  const now = new Date();
  const reminderTime = this.whatsapp?.reminder?.scheduledFor;

  return reminderTime && reminderTime <= now;
});

// METHODS

// Check for scheduling conflicts
bookingSchema.methods.checkForConflicts = async function () {
  if (!this.staffId) return false;

  const conflict = await this.constructor.findOne({
    businessId: this.businessId,
    staffId: this.staffId,
    _id: { $ne: this._id },
    status: { $in: ["confirmed", "pending", "arrived", "in_progress"] },
    $or: [
      {
        // New booking starts during existing booking
        scheduledAt: { $lt: this.timeSlot.endTime },
        "timeSlot.endTime": { $gt: this.scheduledAt },
      },
      {
        // New booking ends during existing booking
        "timeSlot.startTime": { $lt: this.timeSlot.endTime },
        "timeSlot.endTime": { $gt: this.timeSlot.startTime },
      },
    ],
  });

  if (conflict) {
    throw new Error(
      `Time conflict with existing booking at ${conflict.scheduledAt}`,
    );
  }

  return false;
};

// Confirm booking
bookingSchema.methods.confirm = async function (userId) {
  this.status = "confirmed";
  this.updatedBy = userId;

  // Schedule reminder
  const reminderTime = new Date(this.scheduledAt);
  reminderTime.setHours(reminderTime.getHours() - 24);

  this.whatsapp = this.whatsapp || {};
  this.whatsapp.reminder = {
    scheduledFor: reminderTime,
    status: "scheduled",
    reminderType: "24h",
  };

  return this.save();
};

// Cancel booking
bookingSchema.methods.cancel = async function (reason, userId, notes = "") {
  this.status = "cancelled";
  this.cancellationReason = reason;
  this.cancellationNotes = notes;
  this.cancelledAt = new Date();
  this.cancelledBy = userId;

  // Cancel any scheduled WhatsApp messages
  if (this.whatsapp) {
    if (this.whatsapp.reminder) {
      this.whatsapp.reminder.status = "failed";
    }
    if (this.whatsapp.followUp) {
      this.whatsapp.followUp.status = "failed";
    }
  }

  // Update customer metrics
  await mongoose
    .model("Customer")
    .findByIdAndUpdate(this.customerId, { $inc: { cancelledAppointments: 1 } });

  return this.save();
};

// Mark as no-show
bookingSchema.methods.markAsNoShow = async function (userId) {
  this.status = "no_show";
  this.updatedBy = userId;

  // Update customer metrics
  await mongoose
    .model("Customer")
    .findByIdAndUpdate(this.customerId, { $inc: { noShowCount: 1 } });

  return this.save();
};

// Complete booking
bookingSchema.methods.complete = async function (userId, feedback = null) {
  this.status = "completed";
  this.updatedBy = userId;

  // Schedule follow-up message
  const followUpTime = new Date();
  followUpTime.setHours(followUpTime.getHours() + 2);

  this.whatsapp = this.whatsapp || {};
  this.whatsapp.followUp = {
    scheduledFor: followUpTime,
    status: "scheduled",
  };

  if (feedback) {
    this.feedback = {
      ...feedback,
      submittedAt: new Date(),
    };
  }

  return this.save();
};

// Track WhatsApp confirmation sent
bookingSchema.methods.trackConfirmationSent = async function (messageId) {
  if (!this.whatsapp) this.whatsapp = {};
  this.whatsapp.confirmation = {
    messageId,
    sentAt: new Date(),
    status: "sent",
  };

  return this.save();
};

// Track WhatsApp reminder sent
bookingSchema.methods.trackReminderSent = async function (messageId) {
  if (!this.whatsapp) this.whatsapp = {};
  if (!this.whatsapp.reminder) this.whatsapp.reminder = {};

  this.whatsapp.reminder = {
    ...this.whatsapp.reminder,
    messageId,
    sentAt: new Date(),
    status: "sent",
  };

  this.reminderSent = true;
  this.reminderSentAt = new Date();

  return this.save();
};

// Track follow-up sent
bookingSchema.methods.trackFollowUpSent = async function (messageId) {
  if (!this.whatsapp) this.whatsapp = {};
  if (!this.whatsapp.followUp) this.whatsapp.followUp = {};

  this.whatsapp.followUp = {
    ...this.whatsapp.followUp,
    messageId,
    sentAt: new Date(),
    status: "sent",
  };

  this.followUpSent = true;
  this.followUpSentAt = new Date();

  return this.save();
};

// Request review
bookingSchema.methods.requestReview = async function (platform = "google") {
  if (!this.whatsapp) this.whatsapp = {};

  const reviewLink = await this.generateReviewLink(platform);

  this.whatsapp.reviewRequest = {
    scheduledFor: new Date(),
    status: "pending",
    platform,
    reviewLink,
  };

  this.reviewRequested = true;

  return this.save();
};

// Generate review link
bookingSchema.methods.generateReviewLink = async function (platform) {
  const business = await mongoose.model("Business").findById(this.businessId);

  if (platform === "google" && business.engagement?.reviewLink) {
    return business.engagement.reviewLink;
  }

  // Generate internal review link
  return `${process.env.APP_URL}/review/${this._id}`;
};

// Add payment
bookingSchema.methods.addPayment = async function (
  amount,
  method,
  reference = "",
  userId = null,
) {
  this.payments = this.payments || [];
  this.payments.push({
    amount,
    method,
    reference,
    receivedBy: userId,
    paidAt: new Date(),
  });

  this.amountPaid = (this.amountPaid || 0) + amount;
  this.amountDue = this.totalAmount - this.amountPaid;

  if (this.amountPaid >= this.totalAmount) {
    this.paymentStatus = "paid";
  } else if (this.amountPaid > 0) {
    this.paymentStatus = "partial";
  }

  return this.save();
};

// Reschedule booking
bookingSchema.methods.reschedule = async function (newDateTime, userId) {
  const oldBooking = this.toObject();

  // Create new booking
  const newBooking = new this.constructor({
    ...oldBooking,
    _id: undefined,
    scheduledAt: newDateTime,
    status: "pending",
    rescheduledFrom: this._id,
    rescheduleCount: (this.rescheduleCount || 0) + 1,
    createdBy: userId,
    reminderSent: false,
    followUpSent: false,
  });

  await newBooking.save();

  // Update old booking
  this.rescheduledTo = newBooking._id;
  this.status = "rescheduled";
  await this.save();

  return newBooking;
};

// STATICS

// Find bookings that need reminders
bookingSchema.statics.findBookingsNeedingReminders = function (
  businessId = null,
) {
  const now = new Date();
  const query = {
    status: "confirmed",
    "whatsapp.reminder.status": "scheduled",
    "whatsapp.reminder.scheduledFor": { $lte: now },
    scheduledAt: { $gt: now },
  };

  if (businessId) {
    query.businessId = businessId;
  }

  return this.find(query).populate("customerId");
};

// Find completed bookings needing follow-up
bookingSchema.statics.findBookingsNeedingFollowUp = function (
  businessId = null,
) {
  const now = new Date();
  const query = {
    status: "completed",
    "whatsapp.followUp.status": "scheduled",
    "whatsapp.followUp.scheduledFor": { $lte: now },
  };

  if (businessId) {
    query.businessId = businessId;
  }

  return this.find(query).populate("customerId");
};

// Find bookings needing review requests
bookingSchema.statics.findBookingsNeedingReviews = function (
  businessId = null,
  daysAfter = 1,
) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysAfter);

  const query = {
    status: "completed",
    reviewRequested: false,
    completedAt: { $lte: cutoffDate },
  };

  if (businessId) {
    query.businessId = businessId;
  }

  return this.find(query).populate("customerId");
};

// Get daily schedule
bookingSchema.statics.getDailySchedule = function (
  businessId,
  date = new Date(),
) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  return this.find({
    businessId,
    scheduledAt: { $gte: startOfDay, $lte: endOfDay },
    status: { $in: ["confirmed", "pending", "arrived", "in_progress"] },
  })
    .populate("customerId", "name phone")
    .populate("serviceId", "name duration")
    .populate("staffId", "name")
    .sort({ scheduledAt: 1 });
};

// Get no-show rate
bookingSchema.statics.getNoShowRate = async function (businessId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const stats = await this.aggregate([
    {
      $match: {
        businessId: mongoose.Types.ObjectId(businessId),
        scheduledAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        noShows: {
          $sum: { $cond: [{ $eq: ["$status", "no_show"] }, 1, 0] },
        },
        cancellations: {
          $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
        },
      },
    },
  ]);

  if (stats.length === 0) return { noShowRate: 0, cancellationRate: 0 };

  return {
    noShowRate: (stats[0].noShows / stats[0].total) * 100,
    cancellationRate: (stats[0].cancellations / stats[0].total) * 100,
  };
};

const Booking = mongoose.model("Booking", bookingSchema);
export default Booking;
