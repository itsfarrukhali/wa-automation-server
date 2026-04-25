// seed/categories.js
import Category from "../src/models/common/categorySchema.js";

const defaultCategories = [
  { name: "salon", displayName: "Salon / Beauty Parlor" },
  { name: "clinic", displayName: "Clinic / Medical" },
  { name: "restaurant", displayName: "Restaurant / Café" },
  { name: "gym", displayName: "Gym / Fitness" },
  { name: "spa", displayName: "Spa / Wellness" },
  { name: "other", displayName: "Other" },
];

export const seedCategories = async () => {
  for (const cat of defaultCategories) {
    await Category.findOneAndUpdate(
      { name: cat.name },
      { $set: { isActive: true, ...cat } },
      { upsert: true, new: true },
    );
  }
  console.log("✅ Categories seeded");
};
