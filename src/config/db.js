import mongoose from "mongoose";
import ENV from "../lib/env.js";

const connectToDB = async () => {
  await mongoose.connect(ENV.MONGO_URI);
  console.log("✅ MongoDB connected:", mongoose.connection.host);
};

export default connectToDB;
