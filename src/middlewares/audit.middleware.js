import { createAuditLog } from "../services/audit.service.js";

const AUDITED_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SKIP_PATHS = [
  "/api/health",
  "/api/ready",
  "/api/v1/webhooks/whatsapp",
];

export const auditRequests = (req, res, next) => {
  if (!AUDITED_METHODS.has(req.method)) return next();
  if (SKIP_PATHS.some((path) => req.path.startsWith(path))) return next();

  res.on("finish", () => {
    createAuditLog({
      req,
      statusCode: res.statusCode,
      success: res.statusCode < 400,
      errorMessage: res.statusCode >= 400 ? res.statusMessage : undefined,
    }).catch((error) => {
      console.error("[audit] failed to write audit log:", error.message);
    });
  });

  next();
};
