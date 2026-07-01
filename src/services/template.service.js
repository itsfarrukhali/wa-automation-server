import mongoose from "mongoose";
import { env } from "../lib/env.js";
import Business from "../models/business/business.model.js";
import { getMyBusiness } from "./business.service.js";
import { AppError } from "../utils/helpers/errorHandler.utils.js";
import { fetchWhatsAppTemplates } from "../utils/whatsapp/sendMessage.utils.js";

const ensureObjectId = (id, label) => {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError(`Invalid ${label}`, 422);
  }
};

const normalizeTemplateName = (name) =>
  String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

const getBusinessWithSecrets = (userId) =>
  getMyBusiness(userId, "+whatsapp.accessToken +whatsapp.wabaId");

const resolveWhatsAppCredentials = (business) => {
  let accessToken = null;
  try {
    accessToken = business.whatsapp?.decryptToken?.();
  } catch (error) {
    if (!env.WA_TOKEN) {
      throw new AppError(
        "Stored WhatsApp token could not be decrypted. Reconnect WhatsApp with the current WHATSAPP_ENCRYPTION_KEY.",
        422,
      );
    }
  }

  return {
    wabaId: business.whatsapp?.wabaId,
    accessToken: accessToken || env.WA_TOKEN,
  };
};

const serializeTemplate = (template) => ({
  id: template._id,
  name: template.name,
  language: template.language,
  category: template.category,
  status: template.status,
  components: template.components || [],
  usageCount: template.usageCount || 0,
  lastUsed: template.lastUsed,
});

const findTemplate = (business, templateId) => {
  ensureObjectId(templateId, "template ID");
  const template = business.whatsapp?.templates?.id(templateId);
  if (!template) throw new AppError("Template not found", 404);
  return template;
};

export const listTemplates = async (
  userId,
  { status, category, language, search } = {},
) => {
  const business = await getMyBusiness(userId);
  let templates = business.whatsapp?.templates || [];

  if (status) templates = templates.filter((item) => item.status === status);
  if (category) templates = templates.filter((item) => item.category === category);
  if (language) templates = templates.filter((item) => item.language === language);
  if (search) {
    const lowered = search.toLowerCase();
    templates = templates.filter((item) =>
      item.name.toLowerCase().includes(lowered),
    );
  }

  return {
    templates: templates.map(serializeTemplate),
    total: templates.length,
  };
};

export const createTemplate = async (userId, data) => {
  const business = await getMyBusiness(userId);
  const limit = business.plan?.limits?.templates ?? 0;
  const templates = business.whatsapp?.templates || [];

  if (limit !== -1 && templates.length >= limit) {
    throw new AppError(
      `Template limit reached for the ${business.plan?.currentPlan || "free"} plan.`,
      403,
    );
  }

  const name = normalizeTemplateName(data.name);
  if (!name) throw new AppError("Template name is required.", 422);

  const duplicate = templates.find(
    (item) => item.name === name && item.language === (data.language || "en"),
  );
  if (duplicate) {
    throw new AppError("Template with this name and language already exists.", 409);
  }

  business.whatsapp.templates.push({
    name,
    language: data.language || "en",
    category: data.category || "MARKETING",
    status: data.status || "PENDING",
    components: data.components || [],
  });

  await business.save();
  const created = business.whatsapp.templates[business.whatsapp.templates.length - 1];
  return serializeTemplate(created);
};

export const updateTemplate = async (userId, templateId, data) => {
  const business = await getMyBusiness(userId);
  const template = findTemplate(business, templateId);

  if (data.name !== undefined) template.name = normalizeTemplateName(data.name);
  if (data.language !== undefined) template.language = data.language;
  if (data.category !== undefined) template.category = data.category;
  if (data.status !== undefined) template.status = data.status;
  if (data.components !== undefined) template.components = data.components;

  await business.save();
  return serializeTemplate(template);
};

export const deleteTemplate = async (userId, templateId) => {
  const business = await getMyBusiness(userId);
  const template = findTemplate(business, templateId);
  template.deleteOne();
  await business.save();
  return { deleted: true };
};

export const markTemplateUsed = async (userId, templateId) => {
  const business = await getMyBusiness(userId);
  const template = findTemplate(business, templateId);
  template.usageCount = (template.usageCount || 0) + 1;
  template.lastUsed = new Date();
  await business.save();
  return serializeTemplate(template);
};

const mapMetaTemplate = (template) => ({
  name: normalizeTemplateName(template.name),
  language: template.language || "en",
  category: template.category || "OTHER",
  status: template.status || "PENDING",
  components: template.components || [],
});

export const syncTemplatesFromMeta = async (userId) => {
  const business = await getBusinessWithSecrets(userId);
  const credentials = resolveWhatsAppCredentials(business);

  if (!credentials.wabaId || !credentials.accessToken) {
    throw new AppError(
      "WhatsApp WABA ID and access token are required to sync templates.",
      422,
    );
  }

  const response = await fetchWhatsAppTemplates(credentials);
  const metaTemplates = response?.data || [];
  const existing = business.whatsapp.templates || [];
  let created = 0;
  let updated = 0;

  for (const metaTemplate of metaTemplates) {
    const mapped = mapMetaTemplate(metaTemplate);
    const current = existing.find(
      (item) => item.name === mapped.name && item.language === mapped.language,
    );

    if (current) {
      current.category = mapped.category;
      current.status = mapped.status;
      current.components = mapped.components;
      updated += 1;
    } else {
      business.whatsapp.templates.push(mapped);
      created += 1;
    }
  }

  await business.save();

  return {
    synced: metaTemplates.length,
    created,
    updated,
    templates: business.whatsapp.templates.map(serializeTemplate),
  };
};

export const getTemplateStats = async (userId) => {
  const business = await getMyBusiness(userId);
  const templates = business.whatsapp?.templates || [];

  const byStatus = templates.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});

  const byCategory = templates.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});

  return {
    total: templates.length,
    limit: business.plan?.limits?.templates ?? 0,
    byStatus,
    byCategory,
    mostUsed:
      templates
        .slice()
        .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
        .slice(0, 5)
        .map(serializeTemplate),
  };
};

export const incrementTemplateUsageByName = async ({
  businessId,
  name,
  language,
}) => {
  const normalizedName = normalizeTemplateName(name);
  const languageCandidates = [
    language,
    String(language || "").split("_")[0],
    "en",
  ].filter(Boolean);

  for (const candidate of [...new Set(languageCandidates)]) {
    const result = await Business.updateOne(
      {
        _id: businessId,
        "whatsapp.templates.name": normalizedName,
        "whatsapp.templates.language": candidate,
      },
      {
        $inc: { "whatsapp.templates.$.usageCount": 1 },
        $set: { "whatsapp.templates.$.lastUsed": new Date() },
      },
    );

    if (result.modifiedCount > 0) return;
  }
};
