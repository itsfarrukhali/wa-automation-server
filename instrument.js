import "dotenv/config";
import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN?.trim();
const tracesSampleRate = clampSampleRate(
  process.env.SENTRY_TRACES_SAMPLE_RATE,
  0.05,
);

Sentry.init({
  dsn,
  enabled: Boolean(dsn) && process.env.NODE_ENV !== "test",
  environment:
    process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
  release: process.env.SENTRY_RELEASE || undefined,
  sendDefaultPii: false,
  tracesSampleRate,
  integrations: [
    Sentry.expressIntegration({
      shouldHandleError(error) {
        return !error?.isOperational || Number(error?.statusCode || 500) >= 500;
      },
    }),
  ],
  beforeSend(event) {
    event.user = undefined;
    if (event.request) {
      event.request.data = undefined;
      event.request.cookies = undefined;
      event.request.query_string = undefined;
      event.request.headers = keepSafeHeaders(event.request.headers);
      event.request.url = stripQueryString(event.request.url);
    }
    redactEventMessages(event);
    return event;
  },
});

function clampSampleRate(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1, Math.max(0, parsed));
}

function keepSafeHeaders(headers = {}) {
  const safe = {};
  for (const key of ["content-type", "user-agent", "x-request-id"]) {
    if (headers[key]) safe[key] = headers[key];
  }
  return safe;
}

function stripQueryString(value) {
  if (!value) return value;
  try {
    const url = new URL(value, "http://localhost");
    return `${url.origin === "http://localhost" ? "" : url.origin}${url.pathname}`;
  } catch {
    return String(value).split("?", 1)[0];
  }
}

function redactEventMessages(event) {
  const redact = (value) =>
    typeof value === "string"
      ? value
          .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]")
          .replace(/EA[A-Za-z0-9_-]{30,}/g, "[REDACTED_META_TOKEN]")
      : value;

  event.message = redact(event.message);
  for (const value of event.exception?.values || []) {
    value.value = redact(value.value);
  }
}
