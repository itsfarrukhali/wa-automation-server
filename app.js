import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import ApiResponseUtil from "./src/utils/helpers/apiResponse.utils.js";

const app = express();

const allowedOrigins = new Set();
const allowLocalOrigins =
  process.env.NODE_ENV !== "production" ||
  process.env.ALLOW_LOCAL_ORIGINS === "true";

if (process.env.CLIENT_URL) {
  allowedOrigins.add(process.env.CLIENT_URL);
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
      if (
        (!origin || origin === "null") &&
        process.env.NODE_ENV !== "production"
      ) {
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
if (process.env.NODE_ENV !== "production") {
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

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

export default app;
