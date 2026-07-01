import { env } from "../../lib/env.js";
import { AppError } from "../helpers/errorHandler.utils.js";

let fetchImplementation = (...args) => globalThis.fetch(...args);

export const setWhatsAppFetchImplementation = (implementation) => {
  fetchImplementation =
    implementation || ((...args) => globalThis.fetch(...args));
};

export const resetWhatsAppFetchImplementation = () => {
  fetchImplementation = (...args) => globalThis.fetch(...args);
};

const assertFetchAvailable = () => {
  if (typeof fetchImplementation !== "function") {
    throw new AppError("Fetch is not available in this Node.js runtime.", 500);
  }
};

export const normalizeWhatsAppPhone = (phone) => {
  const cleaned = String(phone || "").replace(/\D/g, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("92")) return cleaned;
  if (cleaned.startsWith("0")) return `92${cleaned.slice(1)}`;
  if (cleaned.length === 10 && cleaned.startsWith("3")) return `92${cleaned}`;
  return cleaned;
};

export const toE164PakistanPhone = (phone) => {
  const normalized = normalizeWhatsAppPhone(phone);
  return normalized ? `+${normalized}` : "";
};

export const buildTextPayload = ({ to, text, previewUrl = false }) => ({
  messaging_product: "whatsapp",
  recipient_type: "individual",
  to: normalizeWhatsAppPhone(to),
  type: "text",
  text: {
    preview_url: Boolean(previewUrl),
    body: text,
  },
});

export const buildTemplatePayload = ({
  to,
  templateName,
  language = "en_US",
  components = [],
}) => ({
  messaging_product: "whatsapp",
  to: normalizeWhatsAppPhone(to),
  type: "template",
  template: {
    name: templateName,
    language: {
      code: language,
    },
    ...(components?.length ? { components } : {}),
  },
});

export const sendWhatsAppMessage = async ({
  phoneNumberId,
  accessToken,
  payload,
}) => {
  assertFetchAvailable();

  if (!phoneNumberId) {
    throw new AppError("WhatsApp phoneNumberId is required.", 422);
  }
  if (!accessToken) {
    throw new AppError("WhatsApp access token is required.", 422);
  }
  if (!payload?.to || !payload?.type) {
    throw new AppError("A valid WhatsApp message payload is required.", 422);
  }

  const response = await fetchImplementation(
    `https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data?.error?.message ||
      `WhatsApp API request failed with status ${response.status}`;
    const error = new AppError(message, 502);
    error.meta = {
      provider: "meta_whatsapp",
      status: response.status,
      code: data?.error?.code,
      type: data?.error?.type,
    };
    throw error;
  }

  return data;
};

export const fetchWhatsAppTemplates = async ({ wabaId, accessToken }) => {
  assertFetchAvailable();

  if (!wabaId) {
    throw new AppError("WhatsApp Business Account ID is required.", 422);
  }
  if (!accessToken) {
    throw new AppError("WhatsApp access token is required.", 422);
  }

  const response = await fetchImplementation(
    `https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION}/${wabaId}/message_templates`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data?.error?.message ||
      `WhatsApp templates request failed with status ${response.status}`;
    const error = new AppError(message, 502);
    error.meta = {
      provider: "meta_whatsapp",
      status: response.status,
      code: data?.error?.code,
      type: data?.error?.type,
    };
    throw error;
  }

  return data;
};
