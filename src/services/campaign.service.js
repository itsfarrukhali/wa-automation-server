import mongoose from "mongoose";
import Business from "../models/business/business.model.js";
import Campaign from "../models/campaign.model.js";
import Customer from "../models/customer.model.js";
import MessageLog from "../models/messagelog.model.js";
import { env } from "../lib/env.js";
import { getMyBusiness } from "./business.service.js";
import { AppError } from "../utils/helpers/errorHandler.utils.js";
import {
  buildTemplatePayload,
  buildTextPayload,
  sendWhatsAppMessage,
} from "../utils/whatsapp/sendMessage.utils.js";

const DEFAULT_LIMIT = 25;
const MAX_CAMPAIGN_MESSAGE_LENGTH = 1024;
const CAMPAIGN_TYPE_TO_MESSAGE_TYPE = {
  winback: "campaign_winback",
  birthday: "campaign_birthday",
  promo: "campaign_promo",
  review: "campaign_review",
  announcement: "campaign_announcement",
  seasonal: "campaign_announcement",
  follow_up: "campaign_review",
  reminder: "campaign_announcement",
};

const ensureObjectId = (id, label) => {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError(`Invalid ${label}`, 422);
  }
};

const getBusinessWithSecrets = (userId) =>
  getMyBusiness(userId, "+whatsapp.accessToken +whatsapp.wabaId");

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
    throw new AppError("WhatsApp is not fully connected.", 422);
  }

  return { phoneNumberId, accessToken };
};

const getCampaignForBusiness = async (businessId, campaignId) => {
  ensureObjectId(campaignId, "campaign ID");

  const campaign = await Campaign.findOne({ _id: campaignId, businessId });
  if (!campaign) throw new AppError("Campaign not found", 404);
  return campaign;
};

const assertCampaignPlanLimit = async (business) => {
  const limit = business.plan?.limits?.campaigns ?? 0;
  if (limit === -1) return;

  const activeCount = await Campaign.countDocuments({
    businessId: business._id,
    status: { $nin: ["cancelled", "completed", "failed"] },
  });

  if (activeCount >= limit) {
    throw new AppError(
      `Campaign limit reached for the ${business.plan?.currentPlan || "free"} plan.`,
      403,
    );
  }
};

const getRemainingMonthlyMessages = (business) => {
  const limit = business.plan?.limits?.monthlyMessages ?? 0;
  const used = business.plan?.usage?.messagesThisMonth ?? 0;
  if (limit === -1) return Number.POSITIVE_INFINITY;
  return Math.max(limit - used, 0);
};

const buildTargetQuery = (businessId, target = {}) => {
  const query = {
    businessId,
    status: "active",
    deletedAt: null,
    whatsappOptIn: true,
    optedOut: false,
  };

  const specificCustomers = target.specificCustomers || [];
  if (specificCustomers.length > 0) {
    query._id = { $in: specificCustomers };
  }

  const excluded = target.excludeCustomers || [];
  if (excluded.length > 0) {
    query._id = query._id || {};
    query._id.$nin = excluded;
  }

  const tags = target.tags || [];
  if (tags.length > 0 && !tags.includes("all")) {
    query.tags = { $in: tags };
  }

  const filters = target.filters || {};
  if (filters.minVisits !== undefined || filters.maxVisits !== undefined) {
    query.totalVisits = {};
    if (filters.minVisits !== undefined) query.totalVisits.$gte = filters.minVisits;
    if (filters.maxVisits !== undefined) query.totalVisits.$lte = filters.maxVisits;
  }
  if (filters.minSpent !== undefined || filters.maxSpent !== undefined) {
    query.totalSpent = {};
    if (filters.minSpent !== undefined) query.totalSpent.$gte = filters.minSpent;
    if (filters.maxSpent !== undefined) query.totalSpent.$lte = filters.maxSpent;
  }
  if (filters.lastVisitBefore || filters.lastVisitAfter) {
    query.lastVisit = {};
    if (filters.lastVisitBefore) {
      query.lastVisit.$lte = new Date(filters.lastVisitBefore);
    }
    if (filters.lastVisitAfter) {
      query.lastVisit.$gte = new Date(filters.lastVisitAfter);
    }
  }
  if (filters.gender && filters.gender !== "all") query.gender = filters.gender;
  if (filters.city) {
    query["address.city"] = new RegExp(`^${filters.city}$`, "i");
  }

  return query;
};

const findEligibleRecipients = async (businessId, target, limit = 5000) => {
  return Customer.find(buildTargetQuery(businessId, target))
    .sort({ "engagement.score": -1, updatedAt: -1 })
    .limit(Number(limit))
    .select("name phone whatsappNumber whatsappOptIn optedOut tags totalVisits totalSpent");
};

const personalize = (template, customer, business) => {
  return String(template || "")
    .replace(/{{name}}/g, customer.name || "Valued Customer")
    .replace(/{{business}}/g, business.name || "our business")
    .replace(/{{date}}/g, new Date().toLocaleDateString("en-PK"))
    .replace(/{{time}}/g, new Date().toLocaleTimeString("en-PK"));
};

const incrementBusinessMessageUsage = async (businessId, metric = "sent") => {
  const inc = {
    "whatsapp.messages.total": 1,
    "whatsapp.messages.thisMonth": 1,
    "whatsapp.messages.today": 1,
  };

  if (metric === "sent") inc["plan.usage.messagesThisMonth"] = 1;
  if (metric === "failed") inc["whatsapp.messages.failed"] = 1;

  await Business.updateOne({ _id: businessId }, { $inc: inc });
};

const createCampaignMessageLog = async ({
  business,
  campaign,
  customer,
  userId,
  content,
  contentType,
}) => {
  return MessageLog.create({
    businessId: business._id,
    customerId: customer._id,
    staffId: userId,
    campaignId: campaign._id,
    type: CAMPAIGN_TYPE_TO_MESSAGE_TYPE[campaign.type] || "campaign_announcement",
    direction: "out",
    contentType,
    content,
    template:
      contentType === "template"
        ? {
            name: campaign.whatsappTemplate?.templateName,
            language: campaign.whatsappTemplate?.language || "en",
            components: campaign.whatsappTemplate?.components || [],
          }
        : undefined,
    status: "pending",
    isAutomated: true,
    waBusinessPhone: business.whatsapp?.displayPhoneNumber,
    waCustomerPhone: customer.whatsappNumber || customer.phone,
  });
};

export const listCampaigns = async (
  userId,
  { page = 1, limit = 20, status, type, search } = {},
) => {
  const business = await getMyBusiness(userId);
  const safePage = Number(page);
  const safeLimit = Number(limit);
  const filter = { businessId: business._id };

  if (status) filter.status = status;
  if (type) filter.type = type;
  if (search) filter.$text = { $search: search };

  const [campaigns, total] = await Promise.all([
    Campaign.find(filter)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .populate("createdBy", "name email"),
    Campaign.countDocuments(filter),
  ]);

  return {
    campaigns,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.ceil(total / safeLimit),
    },
  };
};

export const createCampaign = async (userId, data) => {
  const business = await getMyBusiness(userId);
  await assertCampaignPlanLimit(business);

  const message = String(data.message || "").trim();
  if (!message) throw new AppError("message is required.", 422);
  if (message.length > MAX_CAMPAIGN_MESSAGE_LENGTH) {
    throw new AppError(
      `message cannot exceed ${MAX_CAMPAIGN_MESSAGE_LENGTH} characters.`,
      422,
    );
  }

  const recipients = await findEligibleRecipients(business._id, data.target, 1);
  const estimatedRecipients = await Customer.countDocuments(
    buildTargetQuery(business._id, data.target),
  );

  const campaign = await Campaign.create({
    businessId: business._id,
    name: data.name,
    description: data.description,
    type: data.type,
    target: {
      ...(data.target || {}),
      estimatedRecipients,
    },
    message,
    whatsappTemplate: data.whatsappTemplate,
    variables: data.variables || [],
    media: data.media,
    schedule: data.schedule || { frequency: "once" },
    scheduledAt: data.scheduledAt || null,
    tags: data.tags || [],
    budget: data.budget,
    status: data.scheduledAt ? "scheduled" : "draft",
    createdBy: userId,
    metrics: {
      totalTargeted: estimatedRecipients,
      eligibleRecipients: estimatedRecipients,
    },
  });

  return {
    campaign,
    preview: {
      estimatedRecipients,
      sampleRecipients: recipients.map((customer) => ({
        id: customer._id,
        name: customer.name,
        phone: customer.whatsappNumber || customer.phone,
      })),
    },
  };
};

export const previewCampaignRecipients = async (
  userId,
  { campaignId, target, limit = DEFAULT_LIMIT } = {},
) => {
  const business = await getMyBusiness(userId);
  let targetConfig = target || {};

  if (campaignId) {
    const campaign = await getCampaignForBusiness(business._id, campaignId);
    targetConfig = campaign.target || {};
  }

  const [recipients, total] = await Promise.all([
    findEligibleRecipients(business._id, targetConfig, limit),
    Customer.countDocuments(buildTargetQuery(business._id, targetConfig)),
  ]);

  return {
    total,
    recipients: recipients.map((customer) => ({
      id: customer._id,
      name: customer.name,
      phone: customer.whatsappNumber || customer.phone,
      tags: customer.tags,
      totalVisits: customer.totalVisits,
      totalSpent: customer.totalSpent,
    })),
  };
};

export const getCampaign = async (userId, campaignId) => {
  const business = await getMyBusiness(userId);
  return getCampaignForBusiness(business._id, campaignId);
};

export const updateCampaign = async (userId, campaignId, data) => {
  const business = await getMyBusiness(userId);
  const campaign = await getCampaignForBusiness(business._id, campaignId);

  if (!["draft", "scheduled", "paused"].includes(campaign.status)) {
    throw new AppError("Only draft, scheduled, or paused campaigns can be edited.", 409);
  }

  const allowed = [
    "name",
    "description",
    "type",
    "target",
    "message",
    "whatsappTemplate",
    "variables",
    "media",
    "schedule",
    "scheduledAt",
    "tags",
    "budget",
  ];

  for (const field of allowed) {
    if (data[field] !== undefined) campaign[field] = data[field];
  }

  if (data.target !== undefined) {
    const estimatedRecipients = await Customer.countDocuments(
      buildTargetQuery(business._id, data.target),
    );
    campaign.target.estimatedRecipients = estimatedRecipients;
    campaign.metrics.totalTargeted = estimatedRecipients;
    campaign.metrics.eligibleRecipients = estimatedRecipients;
  }

  if (data.scheduledAt !== undefined) {
    campaign.status = data.scheduledAt ? "scheduled" : "draft";
  }

  return campaign.save();
};

export const launchCampaign = async (
  userId,
  campaignId,
  { dryRun = false, sendMode = "text", allowPartial = false, limit } = {},
) => {
  const business = await getBusinessWithSecrets(userId);
  const campaign = await getCampaignForBusiness(business._id, campaignId);

  if (["completed", "cancelled", "failed"].includes(campaign.status)) {
    throw new AppError(`Cannot launch a ${campaign.status} campaign.`, 409);
  }

  const recipients = await findEligibleRecipients(
    business._id,
    campaign.target,
    limit || 5000,
  );

  if (recipients.length === 0) {
    throw new AppError("No eligible opted-in recipients found for this campaign.", 422);
  }

  const remainingMessages = getRemainingMonthlyMessages(business);
  if (recipients.length > remainingMessages && !allowPartial) {
    throw new AppError(
      `Campaign needs ${recipients.length} messages but only ${remainingMessages} monthly messages remain.`,
      403,
    );
  }

  const sendableRecipients = recipients.slice(0, remainingMessages);
  const preview = sendableRecipients.map((customer) => ({
    customerId: customer._id,
    name: customer.name,
    phone: customer.whatsappNumber || customer.phone,
    message: personalize(campaign.message, customer, business),
  }));

  if (dryRun === true || dryRun === "true") {
    return {
      dryRun: true,
      totalEligible: recipients.length,
      sendable: sendableRecipients.length,
      skippedForLimit: recipients.length - sendableRecipients.length,
      preview,
    };
  }

  const credentials = resolveWhatsAppCredentials(business);
  campaign.status = "sending";
  campaign.execution.startedAt = new Date();
  campaign.metrics.totalTargeted = recipients.length;
  campaign.metrics.eligibleRecipients = recipients.length;
  campaign.messages = [];

  const results = [];

  for (const customer of sendableRecipients) {
    const text = personalize(campaign.message, customer, business);
    const recipient = customer.whatsappNumber || customer.phone;
    const contentType = sendMode === "template" ? "template" : "text";
    const log = await createCampaignMessageLog({
      business,
      campaign,
      customer,
      userId,
      content: text,
      contentType,
    });

    campaign.addMessage(customer._id, recipient, customer.name);

    try {
      const response = await sendWhatsAppMessage({
        ...credentials,
        payload:
          sendMode === "template"
            ? buildTemplatePayload({
                to: recipient,
                templateName: campaign.whatsappTemplate?.templateName,
                language: campaign.whatsappTemplate?.language || "en",
                components: campaign.whatsappTemplate?.components || [],
              })
            : buildTextPayload({ to: recipient, text }),
      });

      const waMessageId = response?.messages?.[0]?.id;
      if (waMessageId) log.waMessageId = waMessageId;
      log.status = "sent";
      log.sentAt = new Date();
      await log.save();

      const campaignMessage = campaign.messages.find(
        (item) => item.customerId.toString() === customer._id.toString(),
      );
      campaignMessage.status = "sent";
      campaignMessage.waMessageId = waMessageId;
      campaignMessage.sentAt = new Date();

      await incrementBusinessMessageUsage(business._id, "sent");
      await Customer.updateOne(
        { _id: customer._id },
        {
          $inc: { "engagement.totalMessagesSent": 1 },
          $set: { "engagement.lastMessageSent": new Date() },
          $push: {
            campaignHistory: {
              campaignId: campaign._id,
              sentAt: new Date(),
              status: "sent",
            },
          },
        },
      );

      results.push({
        customerId: customer._id,
        action: "sent",
        messageId: log._id,
        waMessageId,
      });
    } catch (error) {
      log.status = "failed";
      log.errorCode = error?.meta?.code ? String(error.meta.code) : undefined;
      log.errorMessage = error.message;
      log.failureReason = error.message;
      await log.save();

      const campaignMessage = campaign.messages.find(
        (item) => item.customerId.toString() === customer._id.toString(),
      );
      campaignMessage.status = "failed";
      campaignMessage.errorMessage = error.message;
      campaignMessage.failedAt = new Date();

      await incrementBusinessMessageUsage(business._id, "failed");
      results.push({
        customerId: customer._id,
        action: "failed",
        messageId: log._id,
        reason: error.message,
      });
    }
  }

  campaign.calculateMetrics();
  campaign.status = campaign.metrics.failed === sendableRecipients.length ? "failed" : "completed";
  campaign.execution.completedAt = new Date();
  campaign.execution.duration =
    campaign.execution.completedAt.getTime() - campaign.execution.startedAt.getTime();
  await campaign.save();

  return {
    dryRun: false,
    campaign,
    totalEligible: recipients.length,
    processed: results.length,
    sent: results.filter((item) => item.action === "sent").length,
    failed: results.filter((item) => item.action === "failed").length,
    skippedForLimit: recipients.length - sendableRecipients.length,
    results,
  };
};

export const pauseCampaign = async (userId, campaignId) => {
  const business = await getMyBusiness(userId);
  const campaign = await getCampaignForBusiness(business._id, campaignId);
  if (!["scheduled", "queued", "processing", "sending"].includes(campaign.status)) {
    throw new AppError("Only active campaigns can be paused.", 409);
  }
  campaign.status = "paused";
  return campaign.save();
};

export const resumeCampaign = async (userId, campaignId) => {
  const business = await getMyBusiness(userId);
  const campaign = await getCampaignForBusiness(business._id, campaignId);
  if (campaign.status !== "paused") {
    throw new AppError("Only paused campaigns can be resumed.", 409);
  }
  campaign.status = campaign.scheduledAt && campaign.scheduledAt > new Date()
    ? "scheduled"
    : "draft";
  return campaign.save();
};

export const cancelCampaign = async (userId, campaignId, reason) => {
  const business = await getMyBusiness(userId);
  const campaign = await getCampaignForBusiness(business._id, campaignId);
  if (["completed", "cancelled"].includes(campaign.status)) {
    throw new AppError("Cannot cancel completed or already cancelled campaign.", 409);
  }
  campaign.status = "cancelled";
  campaign.failureReason = reason || "User cancelled";
  return campaign.save();
};

export const cloneCampaign = async (userId, campaignId, name) => {
  const business = await getMyBusiness(userId);
  await assertCampaignPlanLimit(business);
  const campaign = await getCampaignForBusiness(business._id, campaignId);
  const cloned = campaign.clone(name);
  cloned.createdBy = userId;
  cloned.businessId = business._id;
  return cloned.save();
};

export const getCampaignAnalytics = async (userId, { days = 30 } = {}) => {
  const business = await getMyBusiness(userId);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - Number(days));

  const campaigns = await Campaign.find({
    businessId: business._id,
    createdAt: { $gte: startDate },
  });

  const totals = campaigns.reduce(
    (acc, campaign) => {
      acc.campaigns += 1;
      acc.targeted += campaign.metrics?.totalTargeted || 0;
      acc.sent += campaign.metrics?.sent || 0;
      acc.delivered += campaign.metrics?.delivered || 0;
      acc.read += campaign.metrics?.read || 0;
      acc.failed += campaign.metrics?.failed || 0;
      acc.revenue += campaign.metrics?.revenue || 0;
      acc.cost += campaign.metrics?.cost || 0;
      return acc;
    },
    {
      campaigns: 0,
      targeted: 0,
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
      revenue: 0,
      cost: 0,
    },
  );

  return {
    days: Number(days),
    totals,
    rates: {
      deliveryRate: totals.sent ? (totals.delivered / totals.sent) * 100 : 0,
      readRate: totals.sent ? (totals.read / totals.sent) * 100 : 0,
      failureRate: totals.sent ? (totals.failed / totals.sent) * 100 : 0,
    },
    byStatus: campaigns.reduce((acc, campaign) => {
      acc[campaign.status] = (acc[campaign.status] || 0) + 1;
      return acc;
    }, {}),
    bestPerforming:
      campaigns
        .slice()
        .sort((a, b) => (b.metrics?.readRate || 0) - (a.metrics?.readRate || 0))[0] ||
      null,
  };
};
