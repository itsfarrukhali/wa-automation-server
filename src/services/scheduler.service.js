import Booking from "../models/booking.model.js";
import Business from "../models/business/business.model.js";
import MessageLog from "../models/messagelog.model.js";
import SchedulerLock from "../models/schedulerLock.model.js";
import { env } from "../lib/env.js";
import { getMyBusiness } from "./business.service.js";
import { AppError } from "../utils/helpers/errorHandler.utils.js";
import {
  buildTextPayload,
  sendWhatsAppMessage,
} from "../utils/whatsapp/sendMessage.utils.js";

const DEFAULT_LIMIT = 25;
const LOCK_KEY = "whatsapp_scheduler";

const getBusinessWithSecrets = (userId) =>
  getMyBusiness(userId, "+whatsapp.accessToken +whatsapp.wabaId");

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

const formatDateTime = (date, timezone = "Asia/Karachi") =>
  new Intl.DateTimeFormat("en-PK", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));

const getCustomerFromBooking = (booking) => booking.customerId;

const canSendToCustomer = (customer) =>
  customer && customer.whatsappOptIn !== false && customer.optedOut !== true;

const buildReminderText = (booking, business) => {
  const customerName =
    booking.customerDetails?.name || getCustomerFromBooking(booking)?.name || "there";
  const serviceName = booking.serviceDetails?.name || "your appointment";
  const appointmentTime = formatDateTime(booking.scheduledAt, business.timezone);

  return `Assalam o alaikum ${customerName}! Reminder: your ${serviceName} appointment at ${business.name} is scheduled for ${appointmentTime}. Reply if you need help.`;
};

const buildFollowUpText = (booking, business) => {
  const customerName =
    booking.customerDetails?.name || getCustomerFromBooking(booking)?.name || "there";

  return `Assalam o alaikum ${customerName}! Thank you for visiting ${business.name}. We hope you had a great experience. Reply with feedback anytime.`;
};

const getRecipient = (booking) => {
  const customer = getCustomerFromBooking(booking);
  return (
    customer?.whatsappNumber ||
    customer?.phone ||
    booking.customerDetails?.whatsappNumber ||
    booking.customerDetails?.phone
  );
};

const createScheduleMessageLog = async ({
  business,
  booking,
  type,
  content,
}) => {
  return MessageLog.create({
    businessId: business._id,
    customerId: booking.customerId._id || booking.customerId,
    bookingId: booking._id,
    type,
    direction: "out",
    contentType: "text",
    content,
    status: "pending",
    isAutomated: true,
    requiredHumanIntervention: false,
    waBusinessPhone: business.whatsapp?.displayPhoneNumber,
    waCustomerPhone: getRecipient(booking),
    scheduledFor:
      type === "booking_reminder"
        ? booking.whatsapp?.reminder?.scheduledFor
        : booking.whatsapp?.followUp?.scheduledFor,
  });
};

const markScheduleFailed = async ({ booking, message, kind, error }) => {
  message.status = "failed";
  message.errorMessage = error.message;
  message.failureReason = error.message;
  await message.save();

  if (kind === "reminder") {
    booking.whatsapp.reminder.status = "failed";
  } else {
    booking.whatsapp.followUp.status = "failed";
  }
  await booking.save();
};

const sendScheduledMessage = async ({ business, booking, kind }) => {
  const customer = getCustomerFromBooking(booking);
  if (!canSendToCustomer(customer)) {
    return {
      bookingId: booking._id,
      action: "skipped",
      reason: "customer_opted_out",
    };
  }

  const recipient = getRecipient(booking);
  if (!recipient) {
    return {
      bookingId: booking._id,
      action: "skipped",
      reason: "missing_customer_phone",
    };
  }

  const type = kind === "reminder" ? "booking_reminder" : "booking_followup";
  const content =
    kind === "reminder"
      ? buildReminderText(booking, business)
      : buildFollowUpText(booking, business);
  const message = await createScheduleMessageLog({
    business,
    booking,
    type,
    content,
  });

  try {
    const response = await sendWhatsAppMessage({
      ...resolveWhatsAppCredentials(business),
      payload: buildTextPayload({
        to: recipient,
        text: content,
      }),
    });

    const waMessageId = response?.messages?.[0]?.id;
    if (waMessageId) message.waMessageId = waMessageId;
    message.status = "sent";
    message.sentAt = new Date();
    await message.save();

    if (kind === "reminder") {
      await booking.trackReminderSent(waMessageId || message._id.toString());
    } else {
      await booking.trackFollowUpSent(waMessageId || message._id.toString());
    }

    await Business.updateOne(
      { _id: business._id },
      {
        $inc: {
          "plan.usage.messagesThisMonth": 1,
          "whatsapp.messages.total": 1,
          "whatsapp.messages.thisMonth": 1,
          "whatsapp.messages.today": 1,
        },
      },
    );

    return {
      bookingId: booking._id,
      action: "sent",
      messageId: message._id,
      waMessageId,
    };
  } catch (error) {
    await markScheduleFailed({ booking, message, kind, error });
    return {
      bookingId: booking._id,
      action: "failed",
      messageId: message._id,
      reason: error.message,
    };
  }
};

const serializeDueBooking = (booking, kind) => ({
  bookingId: booking._id,
  customer: {
    id: booking.customerId?._id,
    name: booking.customerId?.name || booking.customerDetails?.name,
    phone: booking.customerId?.phone || booking.customerDetails?.phone,
    whatsappNumber:
      booking.customerId?.whatsappNumber || booking.customerDetails?.whatsappNumber,
    whatsappOptIn: booking.customerId?.whatsappOptIn,
  },
  service: booking.serviceDetails,
  scheduledAt: booking.scheduledAt,
  messageType: kind,
  messageScheduledFor:
    kind === "reminder"
      ? booking.whatsapp?.reminder?.scheduledFor
      : booking.whatsapp?.followUp?.scheduledFor,
});

export const getDueScheduledMessages = async (
  userId,
  { type = "all", limit = DEFAULT_LIMIT } = {},
) => {
  const business = await getMyBusiness(userId);
  return getDueScheduledMessagesForBusiness(business._id, { type, limit });
};

export const getDueScheduledMessagesForBusiness = async (
  businessId,
  { type = "all", limit = DEFAULT_LIMIT } = {},
) => {
  const safeLimit = Number(limit);
  const [reminders, followUps] = await Promise.all([
    type === "all" || type === "reminder"
      ? Booking.findBookingsNeedingReminders(businessId).limit(safeLimit)
      : [],
    type === "all" || type === "follow_up"
      ? Booking.findBookingsNeedingFollowUp(businessId).limit(safeLimit)
      : [],
  ]);

  return {
    reminders: reminders.map((booking) => serializeDueBooking(booking, "reminder")),
    followUps: followUps.map((booking) => serializeDueBooking(booking, "follow_up")),
    totals: {
      reminders: reminders.length,
      followUps: followUps.length,
    },
  };
};

export const runDueScheduledMessages = async (
  userId,
  { type = "all", limit = DEFAULT_LIMIT, dryRun = false } = {},
) => {
  const business = await getBusinessWithSecrets(userId);
  return runDueScheduledMessagesForBusiness(business, { type, limit, dryRun });
};

export const runDueScheduledMessagesForBusiness = async (
  business,
  { type = "all", limit = DEFAULT_LIMIT, dryRun = false } = {},
) => {
  const safeLimit = Number(limit);
  const due = await getDueScheduledMessagesForBusiness(business._id, {
    type,
    limit: safeLimit,
  });

  if (dryRun === true || dryRun === "true") {
    return {
      dryRun: true,
      ...due,
      results: [],
    };
  }

  const bookingIds = [
    ...due.reminders.map((item) => item.bookingId),
    ...due.followUps.map((item) => item.bookingId),
  ];

  const bookings = await Booking.find({ _id: { $in: bookingIds } }).populate(
    "customerId",
  );

  const bookingById = new Map(
    bookings.map((booking) => [booking._id.toString(), booking]),
  );

  const results = [];

  for (const item of due.reminders) {
    const booking = bookingById.get(item.bookingId.toString());
    if (booking) {
      results.push(
        await sendScheduledMessage({ business, booking, kind: "reminder" }),
      );
    }
  }

  for (const item of due.followUps) {
    const booking = bookingById.get(item.bookingId.toString());
    if (booking) {
      results.push(
        await sendScheduledMessage({ business, booking, kind: "follow_up" }),
      );
    }
  }

  return {
    dryRun: false,
    businessId: business._id,
    totals: due.totals,
    processed: results.length,
    results,
  };
};

export const acquireSchedulerLock = async ({
  key = LOCK_KEY,
  owner = `${process.pid}`,
  lockSeconds = env.SCHEDULER_LOCK_SECONDS,
} = {}) => {
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + Number(lockSeconds) * 1000);

  try {
    const lock = await SchedulerLock.findOneAndUpdate(
      {
        key,
        $or: [{ lockedUntil: { $lte: now } }, { lockedUntil: { $exists: false } }],
      },
      {
        $set: {
          key,
          owner,
          lockedUntil,
          lastRunAt: now,
        },
      },
      {
        upsert: true,
        returnDocument: "after",
      },
    );

    return lock?.owner === owner ? lock : null;
  } catch (error) {
    if (error?.code === 11000) return null;
    throw error;
  }
};

export const releaseSchedulerLock = async ({
  key = LOCK_KEY,
  owner = `${process.pid}`,
  result = {},
} = {}) => {
  await SchedulerLock.updateOne(
    { key, owner },
    {
      $set: {
        lockedUntil: new Date(0),
        lastFinishedAt: new Date(),
        lastResult: result,
      },
    },
  );
};

export const runScheduledMessagesAcrossBusinesses = async ({
  type = "all",
  limit = env.SCHEDULER_BATCH_LIMIT,
  lockSeconds = env.SCHEDULER_LOCK_SECONDS,
  owner = `scheduler-${process.pid}`,
} = {}) => {
  const lock = await acquireSchedulerLock({ owner, lockSeconds });
  if (!lock) {
    return {
      skipped: true,
      reason: "scheduler_lock_held",
    };
  }

  const result = {
    skipped: false,
    businesses: 0,
    processed: 0,
    sent: 0,
    failed: 0,
    skippedMessages: 0,
    details: [],
  };

  try {
    const businesses = await Business.find({
      isActive: true,
      "whatsapp.connectionStatus": "connected",
    }).select("+whatsapp.accessToken +whatsapp.wabaId");

    for (const business of businesses) {
      const businessResult = await runDueScheduledMessagesForBusiness(business, {
        type,
        limit,
      });

      result.businesses += 1;
      result.processed += businessResult.processed || 0;
      result.sent +=
        businessResult.results?.filter((item) => item.action === "sent").length || 0;
      result.failed +=
        businessResult.results?.filter((item) => item.action === "failed").length ||
        0;
      result.skippedMessages +=
        businessResult.results?.filter((item) => item.action === "skipped").length ||
        0;
      result.details.push({
        businessId: business._id,
        processed: businessResult.processed,
        totals: businessResult.totals,
      });
    }

    await releaseSchedulerLock({ owner, result });
    return result;
  } catch (error) {
    await releaseSchedulerLock({
      owner,
      result: { ...result, error: error.message },
    });
    throw error;
  }
};
