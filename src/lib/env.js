import dotenv from "dotenv";
dotenv.config();

const ENV = {
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || "development",
  ALLOW_LOCAL_ORIGINS:
    process.env.NODE_ENV !== "production" ||
    process.env.ALLOW_LOCAL_ORIGINS === "true",
  CLIENT_URL: process.env.CLIENT_URL || "",
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || "",
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || "",
  MONGO_URI: process.env.MONGO_URI || "",
};

export default ENV;
