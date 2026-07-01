import { env } from "../lib/env.js";

const buckets = new Map();

const getClientKey = (req) => {
  const forwardedFor = req.headers["x-forwarded-for"];
  const ip =
    typeof forwardedFor === "string"
      ? forwardedFor.split(",")[0].trim()
      : req.ip || req.socket?.remoteAddress || "unknown";

  if (req.user?.userId) return `user:${req.user.userId}`;
  return `ip:${ip}`;
};

const resolveLimit = (req) => {
  if (req.path.startsWith("/api/v1/auth/login")) {
    return env.AUTH_RATE_LIMIT_MAX;
  }
  if (req.path.startsWith("/api/v1/auth/forgot-password")) {
    return env.AUTH_RATE_LIMIT_MAX;
  }
  if (
    req.path.startsWith("/api/v1/messages") ||
    req.path.startsWith("/api/v1/campaigns") ||
    req.path.startsWith("/api/v1/scheduler/run")
  ) {
    return env.WHATSAPP_RATE_LIMIT_MAX;
  }
  return env.RATE_LIMIT_MAX;
};

const shouldSkip = (req) => {
  if (env.RATE_LIMIT_ENABLED !== "true") return true;
  if (req.path === "/" || req.path === "/api/health" || req.path === "/api/ready") {
    return true;
  }
  if (req.method === "OPTIONS") return true;
  return false;
};

export const rateLimit = (req, res, next) => {
  if (shouldSkip(req)) return next();

  const now = Date.now();
  const windowMs = env.RATE_LIMIT_WINDOW_MS;
  const limit = resolveLimit(req);
  const key = `${getClientKey(req)}:${req.path}`;
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    res.setHeader("x-ratelimit-limit", limit);
    res.setHeader("x-ratelimit-remaining", Math.max(limit - 1, 0));
    res.setHeader("x-ratelimit-reset", Math.ceil((now + windowMs) / 1000));
    return next();
  }

  current.count += 1;
  const remaining = Math.max(limit - current.count, 0);
  res.setHeader("x-ratelimit-limit", limit);
  res.setHeader("x-ratelimit-remaining", remaining);
  res.setHeader("x-ratelimit-reset", Math.ceil(current.resetAt / 1000));

  if (current.count > limit) {
    return res.status(429).json({
      success: false,
      message: "Too many requests. Please try again shortly.",
      requestId: req.requestId,
    });
  }

  return next();
};

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 60_000).unref?.();
