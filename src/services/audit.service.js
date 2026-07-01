import AuditLog from "../models/auditLog.model.js";

const SENSITIVE_KEYS = [
  "password",
  "newPassword",
  "currentPassword",
  "token",
  "accessToken",
  "refreshToken",
  "authorization",
  "cookie",
  "whatsapp_encryption_key",
  "WHATSAPP_ENCRYPTION_KEY",
];

const redactValue = (value) => {
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") return redactSensitive(value);
  return value;
};

export const redactSensitive = (input = {}) => {
  const output = {};
  for (const [key, value] of Object.entries(input || {})) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.some((sensitive) => lowerKey.includes(sensitive.toLowerCase()))) {
      output[key] = "[REDACTED]";
    } else {
      output[key] = redactValue(value);
    }
  }
  return output;
};

export const inferAuditAction = (req) => {
  const resource = req.baseUrl || req.path.split("/").slice(0, 4).join("/");
  const method = req.method.toLowerCase();
  return `${method}:${resource}${req.route?.path ? `:${req.route.path}` : ""}`;
};

export const createAuditLog = async ({
  req,
  statusCode,
  success,
  errorMessage,
}) => {
  if (!req) return null;

  const params = req.params || {};
  const targetId =
    params.userId ||
    params.businessId ||
    params.customerId ||
    params.bookingId ||
    params.campaignId ||
    params.staffId ||
    params.templateId ||
    params.messageId ||
    params.serviceId ||
    null;

  const targetType =
    Object.keys(params)
      .find((key) => key.endsWith("Id"))
      ?.replace(/Id$/, "") || null;

  return AuditLog.create({
    requestId: req.requestId,
    actorId: req.user?.userId || null,
    actorRole: req.user?.role,
    actorEmail: req.user?.email,
    businessId: req.user?.businessId || null,
    action: inferAuditAction(req),
    method: req.method,
    path: req.originalUrl || req.path,
    statusCode,
    ip: req.ip || req.socket?.remoteAddress,
    userAgent: req.headers?.["user-agent"],
    targetType,
    targetId,
    success,
    errorMessage,
    metadata: {
      params: redactSensitive(req.params || {}),
      query: redactSensitive(req.query || {}),
      body: redactSensitive(req.body || {}),
    },
  });
};

export const listAuditLogs = async ({
  page = 1,
  limit = 50,
  actorId,
  businessId,
  action,
  success,
  dateFrom,
  dateTo,
} = {}) => {
  const safePage = Number(page);
  const safeLimit = Number(limit);
  const filter = {};

  if (actorId) filter.actorId = actorId;
  if (businessId) filter.businessId = businessId;
  if (action) filter.action = new RegExp(action, "i");
  if (success !== undefined) filter.success = success === true || success === "true";
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) filter.createdAt.$lte = new Date(dateTo);
  }

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .populate("actorId", "name email role")
      .populate("businessId", "name"),
    AuditLog.countDocuments(filter),
  ]);

  return {
    logs,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.ceil(total / safeLimit),
    },
  };
};
