import { env } from "../lib/env.js";
import logger from "../lib/logger.js";
import { ensureRedisConnected } from "../lib/redis.js";

const buckets = new Map();

const getClientKey = (req) => {
  // Express resolves req.ip according to the app's trust-proxy setting. Reading
  // X-Forwarded-For directly lets a client choose a new bucket on every request.
  const ip = req.ip || req.socket?.remoteAddress || "unknown";

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

const REDIS_RATE_LIMIT_SCRIPT = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
return { current, ttl }
`;

const setRateLimitHeaders = (res, limit, count, resetAt) => {
  res.setHeader("x-ratelimit-limit", limit);
  res.setHeader("x-ratelimit-remaining", Math.max(limit - count, 0));
  res.setHeader("x-ratelimit-reset", Math.ceil(resetAt / 1000));
};

const rejectLimitedRequest = (req, res) =>
  res.status(429).json({
    success: false,
    message: "Too many requests. Please try again shortly.",
    requestId: req.requestId,
  });

const applyMemoryLimit = (req, res, next, key, limit, windowMs) => {
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    setRateLimitHeaders(res, limit, 1, now + windowMs);
    return next();
  }

  current.count += 1;
  setRateLimitHeaders(res, limit, current.count, current.resetAt);
  if (current.count > limit) return rejectLimitedRequest(req, res);
  return next();
};

export const rateLimit = async (req, res, next) => {
  if (shouldSkip(req)) return next();

  const windowMs = env.RATE_LIMIT_WINDOW_MS;
  const limit = resolveLimit(req);
  const key = `${getClientKey(req)}:${req.path}`;

  try {
    const redis = await ensureRedisConnected();
    if (!redis) {
      return applyMemoryLimit(req, res, next, key, limit, windowMs);
    }

    const redisKey = `${env.REDIS_KEY_PREFIX}:rate-limit:${key}`;
    const [count, ttl] = await redis.eval(
      REDIS_RATE_LIMIT_SCRIPT,
      1,
      redisKey,
      windowMs,
    );
    const safeTtl = Number(ttl) > 0 ? Number(ttl) : windowMs;
    setRateLimitHeaders(res, limit, Number(count), Date.now() + safeTtl);

    if (Number(count) > limit) return rejectLimitedRequest(req, res);
    return next();
  } catch (error) {
    logger.error("rate_limit_store_failed", {
      message: error.message,
      path: req.path,
      requestId: req.requestId,
    });

    if (env.RATE_LIMIT_FAIL_OPEN === "false") return next(error);
    return applyMemoryLimit(req, res, next, key, limit, windowMs);
  }
};

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 60_000).unref?.();
