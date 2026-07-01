import mongoose from "mongoose";

const automationRuleSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    priority: {
      type: Number,
      default: 100,
      min: 1,
      max: 1000,
      index: true,
    },
    trigger: {
      type: {
        type: String,
        enum: ["contains_any", "contains_all", "exact_match", "starts_with"],
        default: "contains_any",
      },
      keywords: {
        type: [String],
        validate: {
          validator(value) {
            return Array.isArray(value) && value.length > 0 && value.length <= 20;
          },
          message: "Automation rule requires 1 to 20 keywords.",
        },
      },
      matchCase: {
        type: Boolean,
        default: false,
      },
    },
    response: {
      type: {
        type: String,
        enum: ["text"],
        default: "text",
      },
      text: {
        type: String,
        required: true,
        trim: true,
        maxlength: 4096,
      },
    },
    stopProcessing: {
      type: Boolean,
      default: true,
    },
    metrics: {
      matchedCount: { type: Number, default: 0 },
      sentCount: { type: Number, default: 0 },
      failedCount: { type: Number, default: 0 },
      lastTriggeredAt: Date,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  },
);

automationRuleSchema.index(
  { businessId: 1, name: 1 },
  { unique: true, name: "unique_rule_name_per_business" },
);
automationRuleSchema.index(
  { businessId: 1, isActive: 1, priority: 1 },
  { name: "active_rules_by_priority" },
);

automationRuleSchema.methods.matches = function (messageText = "") {
  const source = this.trigger?.matchCase
    ? String(messageText)
    : String(messageText).toLowerCase();
  const keywords = (this.trigger?.keywords || [])
    .map((keyword) => String(keyword || "").trim())
    .filter(Boolean)
    .map((keyword) => (this.trigger?.matchCase ? keyword : keyword.toLowerCase()));

  if (!source || keywords.length === 0) return false;

  if (this.trigger?.type === "exact_match") {
    return keywords.some((keyword) => source === keyword);
  }
  if (this.trigger?.type === "starts_with") {
    return keywords.some((keyword) => source.startsWith(keyword));
  }
  if (this.trigger?.type === "contains_all") {
    return keywords.every((keyword) => source.includes(keyword));
  }

  return keywords.some((keyword) => source.includes(keyword));
};

const AutomationRule = mongoose.model("AutomationRule", automationRuleSchema);
export default AutomationRule;
