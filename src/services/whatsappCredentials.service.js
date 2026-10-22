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

  if (!storedToken) {
    throw new AppError(
      "This business has no usable WhatsApp token. Reconnect its WhatsApp account.",
      422,
    );
  }
  if (!businessPhoneNumberId) {
    throw new AppError("WhatsApp Phone Number ID is missing.", 422);
  }

  return { phoneNumberId: businessPhoneNumberId, accessToken: storedToken };
};

export const resolveWhatsAppManagementCredentials = (business) => {
  const storedToken = decryptStoredToken(business);
  const businessWabaId = business.whatsapp?.wabaId;

  if (!storedToken) {
    throw new AppError(
      "This business has no usable WhatsApp token. Reconnect its WhatsApp account.",
      422,
    );
  }
  if (!businessWabaId) {
    throw new AppError("WhatsApp Business Account ID is missing.", 422);
  }

  return { wabaId: businessWabaId, accessToken: storedToken };
};
