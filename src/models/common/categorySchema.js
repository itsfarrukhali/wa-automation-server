import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      enum: [
        "clinic",
        "dental_clinic",
        "hospital",
        "medical_store",
        "salon",
        "barber_shop",
        "spa",
        "beauty_parlor",
        "gym",
        "fitness_center",
        "yoga_studio",
        "restaurant",
        "cafe",
        "bakery",
        "catering",
        "boutique",
        "tailor",
        "laundry",
        "tutor",
        "coaching_center",
        "driving_school",
        "real_estate",
        "travel_agency",
        "event_planner",
        "other",
      ],
    },
    displayName: {
      type: String,
      required: true,
    },
    description: String,
    icon: String,
    features: {
      // Kon konse features is category ke liye available hain
      hasAppointments: { type: Boolean, default: true },
      hasServices: { type: Boolean, default: true },
      hasStaff: { type: Boolean, default: true },
      hasInventory: { type: Boolean, default: false },
      hasTableBooking: { type: Boolean, default: false },
      hasOnlinePayment: { type: Boolean, default: true },
    },
    // WhatsApp templates per category
    defaultTemplates: [
      {
        type: {
          type: String,
          enum: ["confirmation", "reminder", "follow_up", "review", "winback"],
        },
        templateName: String,
        language: { type: String, default: "ur" },
        content: String,
      },
    ],
    // Recommended plan for this category
    recommendedPlan: {
      type: String,
      enum: ["free", "starter", "growth", "enterprise"],
      default: "starter",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

// Get category with features
categorySchema.statics.getCategoryFeatures = function (categoryName) {
  return this.findOne({ name: categoryName })
    .select("features displayName")
    .lean();
};

const Category = mongoose.model("Category", categorySchema);
export default Category;
