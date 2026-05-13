import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import ApiResponseUtil from "./src/utils/helpers/apiResponse.utils.js";
import { env } from "./src/lib/env.js";
import userRouter from "./src/routes/api/v1/auth.routes.js";
import businessRouter from "./src/routes/api/v1/business.routes.js";
import adminRouter, {
  superAdminRouter,
} from "./src/routes/api/v1/admin.routes.js";

const app = express();

const allowedOrigins = new Set();
const allowLocalOrigins =
  env.NODE_ENV !== "production" || env.ALLOW_LOCAL_ORIGINS === "true";

if (env.CLIENT_URL) {
  allowedOrigins.add(env.CLIENT_URL);
}

if (allowLocalOrigins) {
  allowedOrigins.add("http://localhost:3000");
  allowedOrigins.add("http://127.0.0.1:3000");
}

const isLocalDevOrigin = (origin) =>
  /^https?:\/\/localhost(:\d+)?$/i.test(origin) ||
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/i.test(origin);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow local tools (Postman, curl) and file:// testing in development.
      if ((!origin || origin === "null") && env.NODE_ENV !== "production") {
        return callback(null, true);
      }

      if (
        origin &&
        (allowedOrigins.has(origin) ||
          (allowLocalOrigins && isLocalDevOrigin(origin)))
      ) {
        return callback(null, true);
      }

      return callback(
        new Error(`CORS blocked for origin: ${origin || "unknown"}`),
      );
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-refresh-token"],
  }),
);

// Body & Cookie Parsers
// Order matters: cookieParser before body parsers

app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Dev Logger
if (env.NODE_ENV !== "production") {
  app.use((req, _res, next) => {
    console.log(`→ ${req.method} ${req.path}`, {
      hasBody: Object.keys(req.body || {}).length > 0,
      hasRefreshCookie: Boolean(req.cookies?.refreshToken),
      hasAuthHeader: Boolean(req.headers.authorization),
    });
    next();
  });
}

// Routes
app.get("/", (_req, res) => {
  ApiResponseUtil.success(
    res,
    { status: "live", timestamp: new Date().toISOString(), version: "1.0.0" },
    "🚀 Replyo Server is Live!",
  );
});
app.get("/api/health", (_req, res) => {
  ApiResponseUtil.success(
    res,
    {
      status: "healthy",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
    "Server is healthy",
  );
});

// API Routes
app.use("/api/v1/auth", userRouter);
app.use("/api/v1/business", businessRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/superadmin", superAdminRouter);

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  let statusCode = err?.isOperational ? err.statusCode || 500 : 500;
  let message = err.message || "Internal server error";

  // Treat Mongoose validation failures as user-caused 4xx errors.
  if (err?.name === "ValidationError") {
    statusCode = 400;

    const validationMessages = Object.values(err.errors || {})
      .map((validationErr) => validationErr?.message)
      .filter(Boolean);

    if (validationMessages.length > 0) {
      message = validationMessages.join(", ");
    }
  }

  res.status(statusCode).json({
    success: false,
    message,
  });
});

export default app;
