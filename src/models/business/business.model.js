import mongoose from "mongoose";
import City from "../common/citySchema.js";
import Category from "../common/categorySchema.js";
import workingHoursSchema from "../common/workingHoursSchema.js";
import locationSchema from "../common/locationSchema.js";
import planSchema from "./planSchema.js";
import whatsappSchema from "./whatsappSchema.js";
import crypto from "crypto";

// Now schema is CLEAN and READABLE
const businessSchema = new mongoose.Schema(
  {
    // Basic Info
    name: {
      type: String,
      required: [true, "Business name is required"],
      trim: true,
      maxlength: 150,
      index: true,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },

    // References to common schemas
    type: {
      type: String,
      required: true,
      validate: {
        validator: async function (v) {
          const category = await Category.findOne({ name: v, isActive: true });
          return !!category;
        },
        message: "Invalid business type",
      },
    },

    // Owner info
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    staffIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // Contact
    phone: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          return !v || /^(\+92|0)?3[0-9]{2}[0-9]{7}$/.test(v.replace(/-/g, ""));
        },
        message: "Invalid Pakistani phone number",
      },
    },
    landline: String,
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email"],
    },

    // WhatsApp Integration
    whatsapp: {
      type: whatsappSchema,
      default: () => ({}),
    },
    whatsappNumber: String,
    whatsappVerified: {
      type: Boolean,
      default: false,
      index: true,
    },

    // Location
    city: {
      type: String,
      validate: {
        validator: async function (v) {
          if (!v) return true;
          const city = await City.findOne({ name: v, isActive: true });
          return !!city;
        },
        message: "City not available for service",
      },
    },
    area: String,
    address: String,
    location: locationSchema,

    // Working Hours
    workingHours: {
      type: [workingHoursSchema],
      default: () => {
        const defaultHours = [];
        const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
        days.forEach((day) => {
          defaultHours.push({
            day,
            isOpen: day !== "sun",
            openTime: "09:00",
            closeTime: day === "fri" ? "18:00" : "18:00",
          });
        });
        return defaultHours;
      },
    },
    timezone: {
      type: String,
      default: "Asia/Karachi",
    },

    // Plan
    plan: {
      type: planSchema,
      default: () => ({}),
    },

    // Onboarding
    onboardingStep: {
      type: Number,
      min: 1,
      max: 5,
      default: 1,
    },
    onboardingCompletedAt: Date,
    onboardingComplete: {
      type: Boolean,
      default: false,
      index: true,
    },

    // Branding
    logo: String,
    coverImage: String,

    // Settings
    settings: {
      notifications: {
        email: { type: Boolean, default: true },
        whatsapp: { type: Boolean, default: true },
      },
      language: {
        type: String,
        enum: ["en", "ur"],
        default: "ur",
      },
      currency: {
        type: String,
        default: "PKR",
      },
    },

    // Customer Engagement
    engagement: {
      reminderTime: { type: Number, default: 24 },
      followUpDays: { type: Number, default: 7 },
      winbackDays: { type: Number, default: 30 },
      reviewRequestEnabled: { type: Boolean, default: true },
      reviewPlatform: {
        type: String,
        enum: ["google", "facebook", "custom"],
        default: "google",
      },
    },

    // Status
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    deletedAt: Date,
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        if (ret.whatsapp) {
          delete ret.whatsapp.accessToken;
          delete ret.whatsapp.webhookVerifyToken;
          delete ret.whatsapp.wabaId;
        }
        return ret;
      },
    },
  },
);

// Indexes
businessSchema.index({ ownerId: 1 });
businessSchema.index({ city: 1, type: 1 });
businessSchema.index({ slug: 1 });
businessSchema.index({ "location.coordinates": "2dsphere" });
businessSchema.index({ onboardingComplete: 1, isActive: 1 });

// Middleware
businessSchema.pre("save", async function (next) {
  try {
    // Generate slug
    if (!this.slug && this.name) {
      this.slug =
        this.name
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "") +
        "-" +
        crypto.randomBytes(3).toString("hex");
    }

    // Reset monthly usage if needed
    if (this.plan && typeof this.plan.resetMonthlyUsage === "function") {
      this.plan.resetMonthlyUsage();
    }

    // Complete onboarding
    if (this.onboardingStep === 5 && !this.onboardingCompletedAt) {
      this.onboardingCompletedAt = new Date();
      this.onboardingComplete = true;
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Virtual for full address
businessSchema.virtual("fullAddress").get(function () {
  return [this.address, this.area, this.city].filter(Boolean).join(", ");
});

// Methods
businessSchema.methods.isOpenNow = function () {
  const now = new Date();
  const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const currentDay = days[now.getDay()];

  const todayHours = this.workingHours.find((h) => h.day === currentDay);
  if (!todayHours) return false;

  return todayHours.isOpenAt ? todayHours.isOpenAt(now) : false;
};

businessSchema.methods.canSendMessage = function () {
  return this.whatsapp.isConnected() && this.plan.canSendMessage();
};

const Business = mongoose.model("Business", businessSchema);
export default Business;
