import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    requestId: { type: String, index: true },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    actorRole: String,
    actorEmail: String,
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      default: null,
      index: true,
    },
    action: { type: String, required: true, index: true },
    method: { type: String, required: true },
    path: { type: String, required: true, index: true },
    statusCode: Number,
    ip: String,
    userAgent: String,
    targetType: String,
    targetId: String,
    metadata: mongoose.Schema.Types.Mixed,
    success: { type: Boolean, default: true, index: true },
    errorMessage: String,
  },
  {
    timestamps: true,
  },
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ businessId: 1, createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 180 * 24 * 60 * 60, name: "audit_retention_180d" },
);

const AuditLog = mongoose.model("AuditLog", auditLogSchema);
export default AuditLog;
