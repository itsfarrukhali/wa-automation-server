import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import ApiResponseUtil from "./src/utils/helpers/apiResponse.utils.js";
import { env } from "./src/lib/env.js";
import {
  attachRequestId,
  securityHeaders,
} from "./src/middlewares/security.middleware.js";
import { auditRequests } from "./src/middlewares/audit.middleware.js";
import { rateLimit } from "./src/middlewares/rateLimit.middleware.js";
import { requestLogger } from "./src/middlewares/requestLogger.middleware.js";
import logger from "./src/lib/logger.js";
import userRouter from "./src/routes/api/v1/auth.routes.js";
import businessRouter from "./src/routes/api/v1/business.routes.js";
import customerRouter from "./src/routes/api/v1/customer.routes.js";
import serviceRouter from "./src/routes/api/v1/service.routes.js";
import bookingRouter from "./src/routes/api/v1/booking.routes.js";
import staffRouter from "./src/routes/api/v1/staff.routes.js";
import messageRouter from "./src/routes/api/v1/message.routes.js";
import webhookRouter from "./src/routes/api/v1/webhook.routes.js";
import automationRouter from "./src/routes/api/v1/automation.routes.js";
import schedulerRouter from "./src/routes/api/v1/scheduler.routes.js";
import campaignRouter from "./src/routes/api/v1/campaign.routes.js";
import templateRouter from "./src/routes/api/v1/template.routes.js";
import reportRouter from "./src/routes/api/v1/report.routes.js";
import billingRouter from "./src/routes/api/v1/billing.routes.js";
import adminRouter, {
  superAdminRouter,
} from "./src/routes/api/v1/admin.routes.js";

const app = express();

app.use(attachRequestId);
app.use(securityHeaders);

const allowedOrigins = new Set();
const allowLocalOrigins =
  env.NODE_ENV !== "production" || env.ALLOW_LOCAL_ORIGINS === "true";

const addConfiguredOrigins = (value) => {
  String(value || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .filter((origin) => !["true", "false"].includes(origin.toLowerCase()))
    .forEach((origin) => allowedOrigins.add(origin));
};

addConfiguredOrigins(env.CLIENT_URL);
addConfiguredOrigins(env.CORS_ALLOWED_ORIGINS);
addConfiguredOrigins(env.ALLOW_LOCAL_ORIGINS);

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
      // Allow server-to-server/internal health checks plus tools like Postman/curl.
      // CORS is a browser protection; requests with no Origin header are not browser CORS requests.
      if (!origin) {
        return callback(null, true);
      }

      // Allow file:// testing only outside production.
      if (origin === "null" && env.NODE_ENV !== "production") {
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
app.use(rateLimit);
app.use(auditRequests);
app.use(requestLogger);

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
app.get("/api/ready", (_req, res) => {
  const mongoReady = mongoose.connection.readyState === 1;
  const ready = mongoReady;

  return res.status(ready ? 200 : 503).json({
    success: ready,
    message: ready ? "Server is ready" : "Server is not ready",
    data: {
      status: ready ? "ready" : "not_ready",
      checks: {
        mongo: mongoReady ? "connected" : "disconnected",
      },
      timestamp: new Date().toISOString(),
    },
  });
});

// API Routes
app.use("/api/v1/auth", userRouter);
app.use("/api/v1/business", businessRouter);
app.use("/api/v1/customers", customerRouter);
app.use("/api/v1/services", serviceRouter);
app.use("/api/v1/bookings", bookingRouter);
app.use("/api/v1/staff", staffRouter);
app.use("/api/v1/messages", messageRouter);
app.use("/api/v1/webhooks", webhookRouter);
app.use("/api/v1/automation-rules", automationRouter);
app.use("/api/v1/scheduler", schedulerRouter);
app.use("/api/v1/campaigns", campaignRouter);
app.use("/api/v1/whatsapp/templates", templateRouter);
app.use("/api/v1/reports", reportRouter);
app.use("/api/v1/billing", billingRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/superadmin", superAdminRouter);

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
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

  logger.error("unhandled_error", {
    requestId: _req.requestId,
    statusCode,
    message,
    stack: err.stack,
    isOperational: err?.isOperational,
    path: _req.originalUrl || _req.path,
    method: _req.method,
    actorId: _req.user?.userId,
  });

  res.status(statusCode).json({
    success: false,
    message,
    requestId: _req.requestId,
  });
});

export default app;
