import mongoose from "mongoose";
import Business from "../models/business/business.model.js";
import Customer from "../models/customer.model.js";
import MessageLog from "../models/messagelog.model.js";
import { env } from "../lib/env.js";
import { getMyBusiness } from "./business.service.js";
import { incrementTemplateUsageByName } from "./template.service.js";
import { AppError } from "../utils/helpers/errorHandler.utils.js";
import {
  buildTemplatePayload,
  buildTextPayload,
  normalizeWhatsAppPhone,
  sendWhatsAppMessage,
} from "../utils/whatsapp/sendMessage.utils.js";

const MAX_TEXT_LENGTH = 4096;
const DEFAULT_PLAN_LIMITS = {
  free: 500,
  starter: 2000,
  growth: 10000,
  enterprise: -1,
};

const getBusinessWithSecrets = (userId) =>
  getMyBusiness(
    userId,
    "+whatsapp.accessToken +whatsapp.webhookVerifyToken +whatsapp.wabaId",
  );

const ensureObjectId = (id, label) => {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError(`Invalid ${label}`, 422);
  }
};

const getCustomerForBusiness = async (businessId, customerId) => {
  ensureObjectId(customerId, "customer ID");

  const customer = await Customer.findOne({
    _id: customerId,
    businessId,
    status: { $ne: "deleted" },
    deletedAt: null,
  });

  if (!customer) throw new AppError("Customer not found", 404);
  if (!customer.whatsappOptIn) {
    throw new AppError("Customer has not opted in to WhatsApp messages.", 403);
  }

  return customer;
};

const resolveWhatsAppCredentials = (business) => {
  const phoneNumberId = business.whatsapp?.phoneNumberId || env.WA_PHONE_ID;
  let businessAccessToken = null;

  try {
    businessAccessToken = business.whatsapp?.decryptToken?.();
  } catch (error) {
    if (!env.WA_TOKEN) {
      throw new AppError(
        "Stored WhatsApp token could not be decrypted. Reconnect WhatsApp with the current WHATSAPP_ENCRYPTION_KEY.",
        422,
      );
    }
  }

  const accessToken = businessAccessToken || env.WA_TOKEN;

  if (!phoneNumberId || !accessToken) {
    throw new AppError(
      "WhatsApp is not fully connected. Add phoneNumberId and access token first.",
      422,
    );
  }

  return { phoneNumberId, accessToken };
};

const assertCanSendMessage = (business) => {
  const currentPlan = business.plan?.currentPlan || "free";
  const limit =
    business.plan?.limits?.monthlyMessages ?? DEFAULT_PLAN_LIMITS[currentPlan] ?? 0;
  const used = business.plan?.usage?.messagesThisMonth ?? 0;

  if (limit !== -1 && used >= limit) {
    throw new AppError(
      `Monthly WhatsApp message limit reached for the ${business.plan?.currentPlan || "free"} plan.`,
      403,
    );
  }
};

const incrementBusinessMessageUsage = async (businessId, metric = "total") => {
  const inc = {
    "whatsapp.messages.total": 1,
    "whatsapp.messages.thisMonth": 1,
    "whatsapp.messages.today": 1,
  };

  if (metric === "total") inc["plan.usage.messagesThisMonth"] = 1;
  if (metric === "failed") inc["whatsapp.messages.failed"] = 1;
  if (metric === "delivered") inc["whatsapp.messages.delivered"] = 1;
  if (metric === "read") inc["whatsapp.messages.read"] = 1;

  await Business.updateOne({ _id: businessId }, { $inc: inc });
};

const createPendingOutboundLog = async ({
  business,
  customer,
  userId,
  type,
  contentType,
  content,
  template,
}) => {
  return MessageLog.create({
    businessId: business._id,
    customerId: customer._id,
    staffId: userId,
    type,
    direction: "out",
    contentType,
    content,
    template,
    status: "pending",
    isAutomated: type !== "manual",
    waBusinessPhone: business.whatsapp?.displayPhoneNumber,
    waCustomerPhone: customer.whatsappNumber || customer.phone,
  });
};

const markOutboundFailed = async (message, error) => {
  message.status = "failed";
  message.errorCode = error?.meta?.code ? String(error.meta.code) : undefined;
  message.errorMessage = error.message;
  message.failureReason = error.message;
  await message.save();
  await incrementBusinessMessageUsage(message.businessId, "failed");
};

const markOutboundSent = async (message, response) => {
  const waMessageId = response?.messages?.[0]?.id;
  if (waMessageId) message.waMessageId = waMessageId;
  message.status = "sent";
  message.sentAt = new Date();
  await message.save();
  await incrementBusinessMessageUsage(message.businessId);
};

export const sendTextMessage = async (userId, data) => {
  const business = await getBusinessWithSecrets(userId);
  assertCanSendMessage(business);

  const customer = await getCustomerForBusiness(business._id, data.customerId);
  const recipient = customer.whatsappNumber || customer.phone;
  const text = String(data.text || "").trim();

  if (!text) throw new AppError("text is required.", 422);
  if (text.length > MAX_TEXT_LENGTH) {
    throw new AppError(`text cannot exceed ${MAX_TEXT_LENGTH} characters.`, 422);
  }

  const message = await createPendingOutboundLog({
    business,
    customer,
    userId,
    type: data.type || "manual",
    contentType: "text",
    content: text,
  });

  try {
    const response = await sendWhatsAppMessage({
      ...resolveWhatsAppCredentials(business),
      payload: buildTextPayload({
        to: recipient,
        text,
        previewUrl: data.previewUrl,
      }),
    });
    await markOutboundSent(message, response);
    await incrementTemplateUsageByName({
      businessId: business._id,
      name: data.templateName,
      language: data.language || "en_US",
    });
    return message;
  } catch (error) {
    await markOutboundFailed(message, error);
    throw error;
  }
};

export const sendTemplateMessage = async (userId, data) => {
  const business = await getBusinessWithSecrets(userId);
  assertCanSendMessage(business);

  const customer = await getCustomerForBusiness(business._id, data.customerId);
  const recipient = customer.whatsappNumber || customer.phone;

  const message = await createPendingOutboundLog({
    business,
    customer,
    userId,
    type: data.type || "manual",
    contentType: "template",
    content: data.templateName,
    template: {
      name: data.templateName,
      language: data.language || "en_US",
      components: data.components || [],
    },
  });

  try {
    const response = await sendWhatsAppMessage({
      ...resolveWhatsAppCredentials(business),
      payload: buildTemplatePayload({
        to: recipient,
        templateName: data.templateName,
        language: data.language,
        components: data.components,
      }),
    });
    await markOutboundSent(message, response);
    return message;
  } catch (error) {
    await markOutboundFailed(message, error);
    throw error;
  }
};

export const listMessages = async (
  userId,
  { page = 1, limit = 20, customerId, direction, status, search } = {},
) => {
  const business = await getMyBusiness(userId);
  const safePage = Number(page);
  const safeLimit = Number(limit);

  const filter = { businessId: business._id };
  if (customerId) {
    ensureObjectId(customerId, "customer ID");
    filter.customerId = customerId;
  }
  if (direction) filter.direction = direction;
  if (status) filter.status = status;
  if (search) filter.$text = { $search: search };

  const [messages, total, unread] = await Promise.all([
    MessageLog.find(filter)
      .sort({ sentAt: -1, _id: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .populate("customerId", "name phone whatsappNumber")
      .populate("staffId", "name"),
    MessageLog.countDocuments(filter),
    MessageLog.getUnreadCount(business._id),
  ]);

  return {
    messages,
    unread,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      pages: Math.ceil(total / safeLimit),
    },
  };
};

export const getInbox = async (
  userId,
  { limit = 50, status = "all", search } = {},
) => {
  const business = await getMyBusiness(userId);
  const safeLimit = Number(limit);
  const filter = { businessId: business._id };

  if (search) {
    filter.$text = { $search: search };
  }

  const messages = await MessageLog.find(filter)
    .sort({ sentAt: -1, _id: -1 })
    .limit(Math.max(safeLimit * 10, 100))
    .populate(
      "customerId",
      "name phone whatsappNumber waProfileName optedOut whatsappOptIn",
    )
    .lean();

  const conversationsByCustomer = new Map();

  for (const message of messages) {
    const customerId = message.customerId?._id?.toString();
    if (!customerId) continue;

    if (!conversationsByCustomer.has(customerId)) {
      conversationsByCustomer.set(customerId, {
        customer: message.customerId,
        lastMessage: message,
        lastMessageAt: message.sentAt || message.createdAt,
        unreadCount: 0,
        needsHuman: false,
      });
    }

    const conversation = conversationsByCustomer.get(customerId);
    const readByStaff = message.readReceipts?.some(
      (receipt) => receipt.readerType === "staff",
    );

    if (message.direction === "in" && !readByStaff) {
      conversation.unreadCount += 1;
    }
    if (message.direction === "in" && message.requiredHumanIntervention) {
      conversation.needsHuman = true;
    }
  }

  let conversations = Array.from(conversationsByCustomer.values());

  if (status === "unread") {
    conversations = conversations.filter((item) => item.unreadCount > 0);
  }
  if (status === "needs_human") {
    conversations = conversations.filter((item) => item.needsHuman);
  }

  return {
    conversations: conversations.slice(0, safeLimit),
    total: conversations.length,
  };
};

export const getConversationThread = async (
  userId,
  customerId,
  { before, limit = 50 } = {},
) => {
  ensureObjectId(customerId, "customer ID");
  const business = await getMyBusiness(userId);
  const safeLimit = Number(limit);
  const filter = {
    businessId: business._id,
    customerId,
  };

  if (before) {
    filter.sentAt = { $lt: new Date(before) };
  }

  const messages = await MessageLog.find(filter)
    .sort({ sentAt: -1, _id: -1 })
    .limit(safeLimit)
    .populate(
      "customerId",
      "name phone whatsappNumber waProfileName optedOut whatsappOptIn",
    )
    .populate("staffId", "name");

  return {
    customerId,
    messages,
    nextBefore: messages.at(-1)?.sentAt || null,
  };
};

export const getMessage = async (userId, messageId) => {
  ensureObjectId(messageId, "message ID");
  const business = await getMyBusiness(userId);

  const message = await MessageLog.findOne({
    _id: messageId,
    businessId: business._id,
  })
    .populate("customerId", "name phone whatsappNumber")
    .populate("staffId", "name");

  if (!message) throw new AppError("Message not found", 404);
  return message;
};

export const markMessageRead = async (userId, messageId) => {
  const message = await getMessage(userId, messageId);
  return message.markAsRead(userId);
};

export const getMessageAnalytics = async (
  userId,
  { dateFrom, dateTo } = {},
) => {
  const business = await getMyBusiness(userId);
  const endDate = dateTo ? new Date(dateTo) : new Date();
  const startDate = dateFrom
    ? new Date(dateFrom)
    : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

  const analytics = await MessageLog.getAnalytics(
    business._id.toString(),
    startDate,
    endDate,
  );

  return {
    dateFrom: startDate,
    dateTo: endDate,
    analytics,
    normalizedTestPhoneExample: normalizeWhatsAppPhone("+92 300 1234567"),
  };
};
