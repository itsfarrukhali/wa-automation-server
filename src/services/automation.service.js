import mongoose from "mongoose";
import AutomationRule from "../models/automationRule.model.js";
import Business from "../models/business/business.model.js";
import MessageLog from "../models/messagelog.model.js";
import { env } from "../lib/env.js";
import { getMyBusiness } from "./business.service.js";
import { AppError } from "../utils/helpers/errorHandler.utils.js";
import {
  buildTextPayload,
  sendWhatsAppMessage,
} from "../utils/whatsapp/sendMessage.utils.js";

const DEFAULT_PLAN_LIMITS = {
  free: 500,
  starter: 2000,
  growth: 10000,
  enterprise: -1,
};

const ensureObjectId = (id, label) => {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError(`Invalid ${label}`, 422);
  }
};

const normalizeRulePayload = (data = {}) => ({
  name: data.name,
  description: data.description || "",
  isActive: data.isActive !== undefined ? data.isActive : true,
  priority: data.priority ?? 100,
  trigger: {
    type: data.trigger?.type || "contains_any",
    keywords: (data.trigger?.keywords || []).map((keyword) =>
      String(keyword).trim(),
    ),
    matchCase: Boolean(data.trigger?.matchCase),
  },
  response: {
    type: "text",
    text: data.response?.text,
  },
  stopProcessing:
    data.stopProcessing !== undefined ? Boolean(data.stopProcessing) : true,
});

const translateDuplicateError = (error) => {
  if (error?.code === 11000) {
    throw new AppError(
      "An automation rule with this name already exists for this business.",
      409,
    );
  }
  throw error;
};

const assertCanSendMessage = (business) => {
  const currentPlan = business.plan?.currentPlan || "free";
  const limit =
    business.plan?.limits?.monthlyMessages ?? DEFAULT_PLAN_LIMITS[currentPlan] ?? 0;
  const used = business.plan?.usage?.messagesThisMonth ?? 0;

  if (limit !== -1 && used >= limit) {
    throw new AppError(
      `Monthly WhatsApp message limit reached for the ${currentPlan} plan.`,
      403,
    );
  }
};

const resolveWhatsAppCredentials = (business) => {
  const phoneNumberId = business.whatsapp?.phoneNumberId || env.WA_PHONE_ID;
  let businessAccessToken = null;

  try {
    businessAccessToken = business.whatsapp?.decryptToken?.();
  } catch {
    businessAccessToken = null;
  }

  const accessToken = businessAccessToken || env.WA_TOKEN;

  if (!phoneNumberId || !accessToken) {
    throw new AppError("WhatsApp is not fully connected.", 422);
  }

  return { phoneNumberId, accessToken };
};

export const createAutomationRule = async (userId, data) => {
  const business = await getMyBusiness(userId);
  const limit = business.plan?.limits?.automationRules ?? 2;

  if (limit !== -1) {
    const currentCount = await AutomationRule.countDocuments({
      businessId: business._id,
      isActive: true,
    });

    if (currentCount >= limit) {
      throw new AppError(
        `Automation rule limit reached for the ${business.plan?.currentPlan || "free"} plan.`,
        403,
      );
    }
  }

  try {
    return await AutomationRule.create({
      ...normalizeRulePayload(data),
      businessId: business._id,
      createdBy: userId,
      updatedBy: userId,
    });
  } catch (error) {
    return translateDuplicateError(error);
  }
};

export const listAutomationRules = async (
  userId,
  { page = 1, limit = 20, isActive } = {},
) => {
  const business = await getMyBusiness(userId);
  const safePage = Number(page);
  const safeLimit = Number(limit);
  const filter = { businessId: business._id };

  if (isActive !== undefined) {
    filter.isActive = isActive === true || isActive === "true";
  }

  const [rules, total] = await Promise.all([
    AutomationRule.find(filter)
      .sort({ priority: 1, createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit),
    AutomationRule.countDocuments(filter),
  ]);

  return {
    rules,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      pages: Math.ceil(total / safeLimit),
    },
  };
};

export const getAutomationRule = async (userId, ruleId) => {
  ensureObjectId(ruleId, "automation rule ID");
  const business = await getMyBusiness(userId);

  const rule = await AutomationRule.findOne({
    _id: ruleId,
    businessId: business._id,
  });

  if (!rule) throw new AppError("Automation rule not found", 404);
  return rule;
};

export const updateAutomationRule = async (userId, ruleId, data) => {
  const rule = await getAutomationRule(userId, ruleId);
  const updates = normalizeRulePayload({
    name: data.name ?? rule.name,
    description: data.description ?? rule.description,
    isActive: data.isActive ?? rule.isActive,
    priority: data.priority ?? rule.priority,
    trigger: data.trigger ?? rule.trigger,
    response: data.response ?? rule.response,
    stopProcessing: data.stopProcessing ?? rule.stopProcessing,
  });

  Object.assign(rule, updates);
  rule.updatedBy = userId;

  try {
    await rule.save();
    return rule;
  } catch (error) {
    return translateDuplicateError(error);
  }
};

export const deleteAutomationRule = async (userId, ruleId) => {
  const rule = await getAutomationRule(userId, ruleId);
  rule.isActive = false;
  rule.updatedBy = userId;
  await rule.save();
  return { id: rule._id };
};

export const processInboundAutomations = async ({
  business,
  customer,
  inboundMessage,
  text,
}) => {
  if (!text || customer.optedOut || !customer.whatsappOptIn) {
    return [];
  }

  const rules = await AutomationRule.find({
    businessId: business._id,
    isActive: true,
  }).sort({ priority: 1, createdAt: 1 });

  const results = [];

  for (const rule of rules) {
    if (!rule.matches(text)) continue;

    await AutomationRule.updateOne(
      { _id: rule._id },
      {
        $inc: { "metrics.matchedCount": 1 },
        $set: { "metrics.lastTriggeredAt": new Date() },
      },
    );

    try {
      assertCanSendMessage(business);

      const outbound = await MessageLog.create({
        businessId: business._id,
        customerId: customer._id,
        type: "quick_reply",
        direction: "out",
        contentType: "text",
        content: rule.response.text,
        status: "pending",
        isAutomated: true,
        requiredHumanIntervention: false,
        waBusinessPhone: business.whatsapp?.displayPhoneNumber,
        waCustomerPhone: customer.whatsappNumber || customer.phone,
        context: {
          replyToMessageId: inboundMessage._id,
          replyToWaMessageId: inboundMessage.waMessageId,
        },
        aiMetadata: {
          intent: "automation_rule",
          entities: [rule.name],
        },
      });

      const response = await sendWhatsAppMessage({
        ...resolveWhatsAppCredentials(business),
        payload: buildTextPayload({
          to: customer.whatsappNumber || customer.phone,
          text: rule.response.text,
        }),
      });

      const waMessageId = response?.messages?.[0]?.id;
      if (waMessageId) outbound.waMessageId = waMessageId;
      outbound.status = "sent";
      outbound.sentAt = new Date();
      await outbound.save();

      await Promise.all([
        AutomationRule.updateOne(
          { _id: rule._id },
          { $inc: { "metrics.sentCount": 1 } },
        ),
        Business.updateOne(
          { _id: business._id },
          {
            $inc: {
              "plan.usage.messagesThisMonth": 1,
              "whatsapp.messages.total": 1,
              "whatsapp.messages.thisMonth": 1,
              "whatsapp.messages.today": 1,
            },
          },
        ),
        MessageLog.updateOne(
          { _id: inboundMessage._id },
          {
            $set: {
              requiredHumanIntervention: false,
              "aiMetadata.intent": "automation_rule_matched",
            },
          },
        ),
      ]);

      results.push({
        action: "automation_sent",
        ruleId: rule._id,
        messageId: outbound._id,
      });
    } catch (error) {
      await AutomationRule.updateOne(
        { _id: rule._id },
        { $inc: { "metrics.failedCount": 1 } },
      );
      results.push({
        action: "automation_failed",
        ruleId: rule._id,
        message: error.message,
      });
    }

    if (rule.stopProcessing) break;
  }

  return results;
};
