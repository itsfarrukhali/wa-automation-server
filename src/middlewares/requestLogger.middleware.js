import logger from "../lib/logger.js";

export const requestLogger = (req, res, next) => {
  const startedAt = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";

    logger.log(level, "http_request", {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl || req.path,
      statusCode: res.statusCode,
      durationMs,
      actorId: req.user?.userId,
      actorRole: req.user?.role,
      ip: req.ip || req.socket?.remoteAddress,
      userAgent: req.headers["user-agent"],
    });
  });

  next();
};
