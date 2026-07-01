import mongoose from "mongoose";

const serviceSchema = new mongoose.Schema(
  {
    // Business Reference
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },

    // Basic Information
    name: {
      type: String,
      required: [true, "Service name is required"],
      trim: true,
      maxlength: [150, "Service name cannot exceed 150 characters"],
    },
    description: {
      type: String,
      maxlength: [500, "Description cannot exceed 500 characters"],
      default: "",
    },

    // Pricing
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price cannot be negative"],
    },

    // Duration & Timing
    duration: {
      type: Number,
      required: [true, "Duration is required"],
      min: [5, "Duration must be at least 5 minutes"],
      max: [480, "Duration cannot exceed 8 hours"],
    },
    bufferBefore: {
      type: Number,
      default: 5,
      min: [0, "Buffer cannot be negative"],
      max: [60, "Buffer cannot exceed 60 minutes"],
    },
    bufferAfter: {
      type: Number,
      default: 5,
      min: [0, "Buffer cannot be negative"],
      max: [60, "Buffer cannot exceed 60 minutes"],
    },

    // Staff Assignment
    assignedStaff: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        index: true,
      },
    ],
    // If empty, any staff can perform

    // Categorization
    category: {
      type: String,
      trim: true,
      default: "General",
      set: (v) => v || "General", // Ensure never null
    },
    subCategory: {
      type: String,
      trim: true,
      default: "",
    },

    // Visual Properties (UI)
    color: {
      type: String,
      default: "#4F46E5", // Indigo
      match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, "Invalid color hex"],
    },
    icon: {
      type: String,
      default: "✂️", // Default scissors emoji
    },
    image: {
      type: String,
      default: "",
    },

    // Status & Display
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isPopular: {
      type: Boolean,
      default: false,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },

    // WhatsApp Templates (per service)
    whatsappTemplates: {
      confirmation: {
        templateName: String,
        customMessage: String,
      },
      reminder: {
        templateName: String,
        customMessage: String,
      },
      followUp: {
        templateName: String,
        customMessage: String,
      },
    },

    // Discount/Promotion Support
    discount: {
      isActive: { type: Boolean, default: false },
      type: {
        type: String,
        enum: ["percentage", "fixed", "package"],
        default: "percentage",
      },
      value: { type: Number, default: 0 }, // Percentage or fixed amount
      validFrom: Date,
      validUntil: Date,
      minBookingAmount: { type: Number, default: 0 },
      code: String, // Coupon code if needed
    },

    // Package/Bundle Support (for future)
    isPackage: {
      type: Boolean,
      default: false,
    },
    packageServices: [
      {
        serviceId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Service",
        },
        name: String,
        duration: Number,
        price: Number,
      },
    ],

    // Additional Options
    addOns: [
      {
        name: String,
        price: Number,
        duration: Number, // Additional minutes
      },
    ],

    // Analytics
    analytics: {
      totalBookings: { type: Number, default: 0 },
      completedBookings: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 },
      averageRating: { type: Number, min: 0, max: 5, default: 0 },
      popularityScore: { type: Number, default: 0 },
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
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.__v;
        // Don't expose internal analytics in JSON
        delete ret.analytics;
        return ret;
      },
    },
  },
);

// INDEXES

// Primary query index
serviceSchema.index({ businessId: 1, isActive: 1, sortOrder: 1 });

// For category filtering
serviceSchema.index({ businessId: 1, category: 1, isActive: 1 });

// For popular services
serviceSchema.index({ businessId: 1, isPopular: 1, isActive: 1 });

// For discount queries
serviceSchema.index({
  businessId: 1,
  "discount.isActive": 1,
  "discount.validUntil": 1,
});

// Text search for service name and description
serviceSchema.index({ name: "text", description: "text" });

// MIDDLEWARE

// Pre-save middleware
serviceSchema.pre("save", function () {
  // Calculate total package duration
  if (this.isPackage && this.packageServices?.length) {
    this.duration = this.packageServices.reduce(
      (total, service) => total + (service.duration || 0),
      0,
    );
    this.price = this.packageServices.reduce(
      (total, service) => total + (service.price || 0),
      0,
    );
  }

  this.updatePopularityScore();

  if (!this.category || this.category === "General") {
    this.category = this.suggestCategory();
  }
});

// VIRTUALS

serviceSchema.virtual("formattedPrice").get(function () {
  return `Rs. ${this.price.toLocaleString("ur-PK")}`;
});

serviceSchema.virtual("formattedDuration").get(function () {
  const hours = Math.floor(this.duration / 60);
  const minutes = this.duration % 60;

  if (hours > 0) {
    return `${hours} hr${hours > 1 ? "s" : ""} ${minutes > 0 ? `${minutes} min` : ""}`;
  }
  return `${minutes} min`;
});

serviceSchema.virtual("totalDuration").get(function () {
  return this.duration + (this.bufferBefore || 0) + (this.bufferAfter || 0);
});

serviceSchema.virtual("isDiscounted").get(function () {
  return (
    this.discount?.isActive &&
    this.discount?.validFrom <= new Date() &&
    this.discount?.validUntil >= new Date()
  );
});

serviceSchema.virtual("discountedPrice").get(function () {
  if (!this.isDiscounted) return this.price;

  if (this.discount.type === "percentage") {
    return this.price * (1 - this.discount.value / 100);
  } else if (this.discount.type === "fixed") {
    return Math.max(0, this.price - this.discount.value);
  }

  return this.price;
});

// METHODS

// Update popularity score based on bookings and ratings
serviceSchema.methods.updatePopularityScore = function () {
  const bookingWeight = 0.6;
  const ratingWeight = 0.4;

  const bookingScore = Math.min(this.analytics.totalBookings / 100, 100);
  const ratingScore = (this.analytics.averageRating / 5) * 100;

  this.analytics.popularityScore =
    bookingScore * bookingWeight + ratingScore * ratingWeight;

  // Auto-mark as popular if score > 70
  if (this.analytics.popularityScore > 70) {
    this.isPopular = true;
  }

  return this.analytics.popularityScore;
};

// Suggest category based on service name
serviceSchema.methods.suggestCategory = function () {
  const name = this.name.toLowerCase();

  const categoryMap = {
    hair: "Hair",
    cut: "Hair",
    facial: "Facial",
    massage: "Massage",
    nails: "Nails",
    manicure: "Nails",
    pedicure: "Nails",
    makeup: "Makeup",
    bridal: "Bridal",
    wax: "Waxing",
    thread: "Threading",
    color: "Hair Color",
    highlights: "Hair Color",
    treatment: "Treatment",
    consult: "Consultation",
  };

  for (const [keyword, category] of Object.entries(categoryMap)) {
    if (name.includes(keyword)) {
      return category;
    }
  }

  return "General";
};

// Check if staff can perform this service
serviceSchema.methods.canStaffPerform = function (staffId) {
  // If no staff assigned, anyone can perform
  if (!this.assignedStaff || this.assignedStaff.length === 0) {
    return true;
  }

  return this.assignedStaff.some(
    (assignedId) => assignedId.toString() === staffId.toString(),
  );
};

// Get available staff for this service
serviceSchema.methods.getAvailableStaff = async function (date) {
  if (!this.assignedStaff || this.assignedStaff.length === 0) {
    // Return all active staff
    return mongoose.model("User").find({
      businessId: this.businessId,
      role: "staff",
      isActive: true,
    });
  }

  // Return only assigned staff
  return mongoose.model("User").find({
    _id: { $in: this.assignedStaff },
    isActive: true,
  });
};

// Apply discount
serviceSchema.methods.applyDiscount = function (code = null) {
  if (!this.isDiscounted) return this.price;

  if (this.discount.code && code !== this.discount.code) {
    return this.price; // Invalid code
  }

  return this.discountedPrice;
};

// Track booking
serviceSchema.methods.trackBooking = async function (completed = false) {
  this.analytics.totalBookings += 1;

  if (completed) {
    this.analytics.completedBookings += 1;
    this.analytics.revenue += this.price;
  }

  this.updatePopularityScore();
  return this.save();
};

// Update rating
serviceSchema.methods.updateRating = async function (newRating) {
  const oldTotal =
    this.analytics.averageRating * this.analytics.completedBookings;
  this.analytics.averageRating =
    (oldTotal + newRating) / (this.analytics.completedBookings + 1);

  this.updatePopularityScore();
  return this.save();
};

// STATICS

// Get active services for a business
serviceSchema.statics.getActiveServices = function (businessId) {
  return this.find({
    businessId,
    isActive: true,
  }).sort({ sortOrder: 1, name: 1 });
};

// Get popular services
serviceSchema.statics.getPopularServices = function (businessId, limit = 5) {
  return this.find({
    businessId,
    isActive: true,
    isPopular: true,
  })
    .sort({ "analytics.popularityScore": -1 })
    .limit(limit);
};

// Get services by category
serviceSchema.statics.getServicesByCategory = function (businessId, category) {
  return this.find({
    businessId,
    isActive: true,
    category,
  }).sort({ sortOrder: 1, name: 1 });
};

// Get discounted services
serviceSchema.statics.getDiscountedServices = function (businessId) {
  const now = new Date();

  return this.find({
    businessId,
    isActive: true,
    "discount.isActive": true,
    "discount.validFrom": { $lte: now },
    "discount.validUntil": { $gte: now },
  });
};

// Bulk import services
serviceSchema.statics.bulkImport = async function (
  businessId,
  services,
  userId,
) {
  const formatted = services.map((s) => ({
    ...s,
    businessId,
    createdBy: userId,
    category: s.category || "General",
  }));

  return this.insertMany(formatted);
};

// Get service analytics
serviceSchema.statics.getAnalytics = async function (businessId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const services = await this.find({ businessId, isActive: true });

  const analytics = {
    totalServices: services.length,
    popularServices: services.filter((s) => s.isPopular).length,
    totalRevenue: services.reduce((sum, s) => sum + s.analytics.revenue, 0),
    averagePrice:
      services.reduce((sum, s) => sum + s.price, 0) / services.length,
    categoryBreakdown: {},
  };

  services.forEach((service) => {
    const cat = service.category || "General";
    analytics.categoryBreakdown[cat] =
      (analytics.categoryBreakdown[cat] || 0) + 1;
  });

  return analytics;
};

// Search services
serviceSchema.statics.searchServices = function (businessId, query) {
  return this.find({
    businessId,
    isActive: true,
    $or: [
      { name: { $regex: query, $options: "i" } },
      { description: { $regex: query, $options: "i" } },
      { category: { $regex: query, $options: "i" } },
    ],
  }).sort({ sortOrder: 1 });
};

const Service = mongoose.model("Service", serviceSchema);
export default Service;
