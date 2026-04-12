import mongoose from "mongoose";

const citySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      enum: [
        "Karachi",
        "Lahore",
        "Islamabad",
        "Rawalpindi",
        "Faisalabad",
        "Multan",
        "Peshawar",
        "Quetta",
        "Gujranwala",
        "Sialkot",
        "Hyderabad",
        "Sukkur",
        "Bahawalpur",
        "Sargodha",
        "Gujrat",
        "Jhelum",
        "Sahiwal",
        "Wah Cantt",
        "Mardan",
        "Mingora",
        "Other",
      ],
    },
    province: {
      type: String,
      enum: ["Punjab", "Sindh", "KPK", "Balochistan", "ICT", "Other"],
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    serviceAvailable: {
      type: Boolean,
      default: true,
    },
    // For future expansion (multiple cities per business)
    postalCodes: [String],
    // Popular areas in this city
    popularAreas: [
      {
        name: String,
        isActive: { type: Boolean, default: true },
      },
    ],
  },
  { timestamps: true },
);

// Static method to get active cities
citySchema.statics.getActiveCities = function () {
  return this.find({ isActive: true, serviceAvailable: true })
    .select("name province")
    .lean();
};

// Virtual for full location
citySchema.virtual("fullLocation").get(function () {
  return `${this.name}, ${this.province}`;
});

const City = mongoose.model("City", citySchema);
export default City;
