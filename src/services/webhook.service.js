import Business from "../models/business/business.model.js";
import Customer from "../models/customer.model.js";
import MessageLog from "../models/messagelog.model.js";
import { env } from "../lib/env.js";
import { processInboundAutomations } from "./automation.service.js";
import { AppError } from "../utils/helpers/errorHandler.utils.js";
import {
  normalizeWhatsAppPhone,
  toE164PakistanPhone,
} from "../utils/whatsapp/sendMessage.utils.js";

const STATUS_MAP = {
  sent: "sent",
  delivered: "delivered",
  read: "read",
  failed: "failed",
};

const OPT_OUT_KEYWORDS = new Set([
  "stop",
  "unsubscribe",
  "opt out",
  "optout",
  "cancel",
  "band",
  "band karo",
  "ruk jao",
]);

const normalizeInboundText = (text = "") =>
  String(text).trim().replace(/\s+/g, " ").toLowerCase();

export const verifyWhatsAppWebhook = (query = {}) => {
  const mode = query["hub.mode"];
  const token = query["hub.verify_token"];
  const challenge = query["hub.challenge"];
  const expectedToken = env.WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && token && token === expectedToken) {
    return challenge;
  }

  throw new AppError("Invalid WhatsApp webhook verification token.", 403);
};

const extractTextContent = (message) => {
  if (message.type === "text") return message.text?.body || "";
  if (message.type === "button") return message.button?.text || "";
  if (message.type === "interactive") {
    return (
      message.interactive?.button_reply?.title ||
      message.interactive?.list_reply?.title ||
      ""
    );
  }
  if (message.type === "image") return message.image?.caption || "[image]";
  if (message.type === "video") return message.video?.caption || "[video]";
  if (message.type === "audio") return "[audio]";
  if (message.type === "document") {
    return message.document?.caption || "[document]";
  }
  if (message.type === "location") return "[location]";
  if (message.type === "contacts") return "[contact]";
  return `[${message.type || "message"}]`;
};

const contentTypeForInbound = (type) => {
  if (type === "text") return "text";
  if (["image", "video", "audio", "document", "sticker"].includes(type)) {
    return "media";
  }
  if (type === "interactive" || type === "button") return "interactive";
  if (type === "location") return "location";
  if (type === "contacts") return "contact";
  return "text";
};

const findBusinessFromChange = async (change) => {
  const phoneNumberId = change?.value?.metadata?.phone_number_id;
  if (!phoneNumberId) return null;

  return Business.findOne({
    "whatsapp.phoneNumberId": String(phoneNumberId),
    isActive: true,
  });
};

const recordWebhookEvent = async (businessId, event, data = {}) => {
  await Business.updateOne(
    { _id: businessId },
    {
      $push: {
        "whatsapp.webhookEvents": {
          $each: [
            {
              event,
              timestamp: new Date(),
              data,
            },
          ],
          $slice: -50,
        },
      },
    },
  );
};

const findOrCreateCustomer = async ({ businessId, contact, from }) => {
  const waId = contact?.wa_id || from;
  const e164 = toE164PakistanPhone(waId);
  const profileName = contact?.profile?.name;

  let customer = await Customer.findOne({
    businessId,
    status: { $ne: "deleted" },
    deletedAt: null,
    $or: [{ phone: e164 }, { whatsappNumber: e164 }],
  });

  if (customer) {
    if (profileName && customer.waProfileName !== profileName) {
      customer.waProfileName = profileName;
      await customer.save();
    }
    return customer;
  }

  customer = await Customer.create({
    businessId,
    name: profileName || `WhatsApp ${normalizeWhatsAppPhone(waId)}`,
    phone: e164,
    whatsappNumber: e164,
    waProfileName: profileName,
    source: "whatsapp",
    whatsappOptIn: true,
    consentGiven: true,
  });

  return customer;
};

const processInboundMessage = async ({ business, value, message }) => {
  const contact = value.contacts?.find((item) => item.wa_id === message.from);
  const customer = await findOrCreateCustomer({
    businessId: business._id,
    contact,
    from: message.from,
  });

  const existing = await MessageLog.findOne({ waMessageId: message.id });
  if (existing) {
    await recordWebhookEvent(business._id, "inbound_duplicate", {
      waMessageId: message.id,
      from: message.from,
      type: message.type,
    });
    return { action: "duplicate_inbound", messageId: existing._id };
  }

  const timestamp = message.timestamp
    ? new Date(Number(message.timestamp) * 1000)
    : new Date();

  const content = extractTextContent(message);
  const normalizedText = normalizeInboundText(content);
  const isOptOut = OPT_OUT_KEYWORDS.has(normalizedText);

  const log = await MessageLog.create({
    businessId: business._id,
    customerId: customer._id,
    type: message.context ? "inbound_reply" : "inbound",
    direction: "in",
    contentType: contentTypeForInbound(message.type),
    content,
    status: "delivered",
    waMessageId: message.id,
    waBusinessPhone: value.metadata?.display_phone_number,
    waCustomerPhone: toE164PakistanPhone(message.from),
    sentAt: timestamp,
    context: message.context ? { replyToWaMessageId: message.context.id } : undefined,
    requiredHumanIntervention: !isOptOut,
    isAutomated: false,
    aiMetadata: {
      intent: isOptOut ? "opt_out" : undefined,
      entities: [],
    },
  });

  await Customer.updateOne(
    { _id: customer._id },
    {
      $set: {
        lastInteraction: new Date(),
        "engagement.lastMessageAt": new Date(),
      },
      $push: {
        interactions: {
          type: "whatsapp_replied",
          messageId: message.id,
          timestamp,
        },
      },
    },
  );

  await recordWebhookEvent(business._id, "inbound_message", {
    waMessageId: message.id,
    from: message.from,
    type: message.type,
    customerId: customer._id,
    messageLogId: log._id,
  });

  if (isOptOut) {
    customer.optedOut = true;
    customer.whatsappOptIn = false;
    customer.optedOutAt = new Date();
    customer.optOutReason = "user_request";
    await customer.save();

    await recordWebhookEvent(business._id, "customer_opted_out", {
      customerId: customer._id,
      waMessageId: message.id,
      from: message.from,
    });

    return { action: "customer_opted_out", messageId: log._id };
  }

  const automations = await processInboundAutomations({
    business,
    customer,
    inboundMessage: log,
    text: content,
  });

  return { action: "created_inbound", messageId: log._id, automations };
};

const processStatusUpdate = async ({ business, status }) => {
  const mappedStatus = STATUS_MAP[status.status];
  if (!mappedStatus) {
    await recordWebhookEvent(business._id, "status_ignored", {
      waMessageId: status.id,
      status: status.status,
    });
    return { action: "ignored_status", waMessageId: status.id };
  }

  const message = await MessageLog.findByWaMessageId(status.id);
  if (!message) {
    await recordWebhookEvent(business._id, "status_missing_message", {
      waMessageId: status.id,
      status: mappedStatus,
    });
    return { action: "missing_message", waMessageId: status.id };
  }

  const previousStatus = message.status;
  await message.updateFromWebhook({
    status: mappedStatus,
    timestamp: status.timestamp,
    error: status.errors?.[0],
  });

  if (previousStatus !== mappedStatus) {
    const inc = {};
    if (mappedStatus === "delivered") inc["whatsapp.messages.delivered"] = 1;
    if (mappedStatus === "read") inc["whatsapp.messages.read"] = 1;
    if (mappedStatus === "failed") inc["whatsapp.messages.failed"] = 1;

    if (Object.keys(inc).length > 0) {
      await Business.updateOne({ _id: business._id }, { $inc: inc });
    }
  }

  await recordWebhookEvent(business._id, "status_update", {
    waMessageId: status.id,
    previousStatus,
    status: mappedStatus,
    conversationId: status.conversation?.id,
    pricingCategory: status.pricing?.category,
    billable: status.pricing?.billable,
  });

  return {
    action: "updated_status",
    waMessageId: status.id,
    status: mappedStatus,
  };
};

export const processWhatsAppWebhook = async (payload = {}) => {
  if (payload.object !== "whatsapp_business_account") {
    return { processed: 0, ignored: 1, results: [] };
  }

  const results = [];
  let ignored = 0;

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== "messages") {
        ignored += 1;
        continue;
      }

      const business = await findBusinessFromChange(change);
      if (!business) {
        ignored += 1;
        results.push({ action: "business_not_found" });
        continue;
      }

      const value = change.value || {};
      for (const message of value.messages || []) {
        results.push(await processInboundMessage({ business, value, message }));
      }
      for (const status of value.statuses || []) {
        results.push(await processStatusUpdate({ business, status }));
      }
    }
  }

  return {
    processed: results.length,
    ignored,
    results,
  };
};
