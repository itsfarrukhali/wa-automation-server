import mongoose from "mongoose";

const locationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point",
    },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: function (v) {
          return (
            Array.isArray(v) &&
            v.length === 2 &&
            v[0] >= -180 &&
            v[0] <= 180 &&
            v[1] >= -90 &&
            v[1] <= 90
          );
        },
        message: "Invalid coordinates. Must be [longitude, latitude]",
      },
    },
    address: {
      street: String,
      area: String,
      city: String,
      postalCode: String,
      landmark: String,
    },
    // Google Places ID for rich location data
    placeId: String,
    // For delivery radius
    serviceRadius: {
      type: Number, // in kilometers
      default: 10,
    },
  },
  { _id: false },
);

// Index for geospatial queries
locationSchema.index({ coordinates: "2dsphere" });

export default locationSchema;
