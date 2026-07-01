import crypto from "crypto";

export const attachRequestId = (req, res, next) => {
  const incomingRequestId = req.headers["x-request-id"];
  const requestId =
    typeof incomingRequestId === "string" && incomingRequestId.trim()
      ? incomingRequestId.trim().slice(0, 100)
      : crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
};

export const securityHeaders = (_req, res, next) => {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("cross-origin-resource-policy", "same-site");
  next();
};
