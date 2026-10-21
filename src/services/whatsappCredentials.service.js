import { env } from "../lib/env.js";
import { AppError } from "../utils/helpers/errorHandler.utils.js";

const decryptStoredToken = (business) => {
  if (!business.whatsapp?.accessToken) return null;

  try {
    const token = business.whatsapp.decryptToken?.();
    if (!token) throw new Error("Decrypted token is empty");
    return token;
  } catch {
    throw new AppError(
      "Stored WhatsApp token is invalid or cannot be decrypted. Reconnect WhatsApp before sending messages.",
      422,
    );
  }
};

export const resolveWhatsAppMessagingCredentials = (business) => {
  const businessPhoneNumberId = business.whatsapp?.phoneNumberId;
  const storedToken = decryptStoredToken(business);

  if (storedToken) {
    if (!businessPhoneNumberId) {
      throw new AppError("WhatsApp Phone Number ID is missing.", 422);
    }
    return { phoneNumberId: businessPhoneNumberId, accessToken: storedToken };
  }

  if (
    businessPhoneNumberId &&
    env.WA_PHONE_ID &&
    businessPhoneNumberId !== env.WA_PHONE_ID
  ) {
    throw new AppError(
      "This business has no usable WhatsApp token. Reconnect its WhatsApp account.",
      422,
    );
  }

  if (!env.WA_PHONE_ID || !env.WA_TOKEN) {
    throw new AppError("WhatsApp is not fully connected.", 422);
  }

  return { phoneNumberId: env.WA_PHONE_ID, accessToken: env.WA_TOKEN };
};

export const resolveWhatsAppManagementCredentials = (business) => {
  const storedToken = decryptStoredToken(business);
  const businessWabaId = business.whatsapp?.wabaId;

  if (storedToken) {
    if (!businessWabaId) {
      throw new AppError("WhatsApp Business Account ID is missing.", 422);
    }
    return { wabaId: businessWabaId, accessToken: storedToken };
  }

  if (
    businessWabaId &&
    env.WA_BUSINESS_ACCOUNT_ID &&
    businessWabaId !== env.WA_BUSINESS_ACCOUNT_ID
  ) {
    throw new AppError(
      "This business has no usable WhatsApp token. Reconnect its WhatsApp account.",
      422,
    );
  }

  const wabaId = businessWabaId || env.WA_BUSINESS_ACCOUNT_ID;
  if (!wabaId || !env.WA_TOKEN) {
    throw new AppError("WhatsApp template access is not configured.", 422);
  }

  return { wabaId, accessToken: env.WA_TOKEN };
};
