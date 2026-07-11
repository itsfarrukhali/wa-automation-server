import mongoose from "mongoose";
import Booking from "../models/booking.model.js";
import Customer from "../models/customer.model.js";
import Service from "../models/service.model.js";
import User from "../models/user.model.js";
import { getMyBusiness } from "./business.service.js";
import { AppError } from "../utils/helpers/errorHandler.utils.js";

const ACTIVE_SCHEDULE_STATUSES = [
  "pending",
  "confirmed",
  "arrived",
  "in_progress",
];

const STATUS_TRANSITIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["arrived", "cancelled", "no_show"],
  arrived: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  no_show: [],
  cancelled: [],
  rescheduled: [],
};

const getBusinessContext = async (userId) => {
  const business = await getMyBusiness(userId);
  return { business, businessId: business._id };
};

const findBookingForBusiness = async (
  businessId,
  bookingId,
  { includeDeleted = false } = {},
) => {
  if (!mongoose.isValidObjectId(bookingId)) {
    throw new AppError("Invalid booking ID", 422);
  }

  const filter = { _id: bookingId, businessId };
  if (!includeDeleted) filter.deletedAt = null;

  const booking = await Booking.findOne(filter);
  if (!booking) throw new AppError("Booking not found", 404);
  return booking;
};

const getCustomerForBusiness = async (businessId, customerId) => {
  const customer = await Customer.findOne({
    _id: customerId,
    businessId,
    status: { $ne: "deleted" },
    deletedAt: null,
  });
  if (!customer) throw new AppError("Customer not found", 404);
  return customer;
};

const getServiceForBusiness = async (businessId, serviceId) => {
  const service = await Service.findOne({
    _id: serviceId,
    businessId,
    isActive: true,
  });
  if (!service) throw new AppError("Service not found", 404);
  return service;
};

const getStaffForBusiness = async (businessId, staffId, service) => {
  if (!staffId) return null;

  const staff = await User.findOne({
    _id: staffId,
    businessId,
    isActive: true,
    role: { $in: ["owner", "staff"] },
  });
  if (!staff) {
    throw new AppError(
      "Assigned staff member is not active in this business.",
      422,
    );
  }
  if (!service.canStaffPerform(staff._id)) {
    throw new AppError(
      "Assigned staff member cannot perform this service.",
      422,
    );
  }
  return staff;
};

const getLocalScheduleParts = (date, timezone) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return {
    day: values.weekday.toLowerCase().slice(0, 3),
    minutes: Number(values.hour) * 60 + Number(values.minute),
  };
};

const parseTime = (value, role = "open") => {
  const [hours, minutes] = value.split(":").map(Number);
  const total = hours * 60 + minutes;
  if (role === "close" && total === 0) return 24 * 60;
  return total;
};

const assertWithinWorkingHours = (business, scheduledAt, duration) => {
  const { day, minutes } = getLocalScheduleParts(
    scheduledAt,
    business.timezone || "Asia/Karachi",
  );
  const hours = business.workingHours.find((entry) => entry.day === day);

  if (!hours?.isOpen) {
    throw new AppError(`Business is closed on ${day}.`, 422);
  }

  const appointmentEnd = minutes + duration;
  if (
    minutes < parseTime(hours.openTime, "open") ||
    appointmentEnd > parseTime(hours.closeTime, "close")
  ) {
    throw new AppError(
      `Booking must fit within business hours (${hours.openTime}-${hours.closeTime}).`,
      422,
    );
  }
};

const assertNoConflict = async ({
  businessId,
  staffId,
  scheduledAt,
  duration,
  bufferBefore = 0,
  bufferAfter = 0,
  excludeBookingId,
}) => {
  if (!staffId) return;

  const candidateStart = new Date(
    scheduledAt.getTime() - bufferBefore * 60 * 1000,
  );
  const candidateEnd = new Date(
    scheduledAt.getTime() + (duration + bufferAfter) * 60 * 1000,
  );
  const filter = {
    businessId,
    staffId,
    deletedAt: null,
    status: { $in: ACTIVE_SCHEDULE_STATUSES },
    scheduledAt: { $lt: candidateEnd },
    "timeSlot.endTime": { $gt: candidateStart },
  };
  if (excludeBookingId) filter._id = { $ne: excludeBookingId };

  const conflict = await Booking.findOne(filter).select("scheduledAt");
  if (conflict) {
    throw new AppError(
      `Staff member already has a booking at ${conflict.scheduledAt.toISOString()}.`,
      409,
    );
  }
};

const buildBookingData = ({
  businessId,
  customer,
  service,
  staff,
  scheduledAt,
  data,
  userId,
}) => ({
  businessId,
  customerId: customer._id,
  serviceId: service._id,
  staffId: staff?._id || null,
  scheduledAt,
  serviceDetails: {
    name: service.name,
    duration: service.duration,
    price: service.price,
    category: service.category,
  },
  customerDetails: {
    name: customer.name,
    phone: customer.phone,
    whatsappNumber: customer.whatsappNumber,
  },
  staffDetails: staff ? { name: staff.name, phone: staff.phone } : undefined,
  timeSlot: {
    startTime: scheduledAt,
    endTime: new Date(scheduledAt.getTime() + service.duration * 60 * 1000),
    duration: service.duration,
    bufferBefore: service.bufferBefore,
    bufferAfter: service.bufferAfter,
  },
  status: data.status || "pending",
  totalAmount: data.totalAmount ?? service.discountedPrice ?? service.price,
  amountPaid: data.amountPaid || 0,
  preferredPaymentMethod: data.preferredPaymentMethod || "cash",
  discount: data.discount,
  notes: data.notes,
  internalNotes: data.internalNotes,
  specialRequests: data.specialRequests,
  source: data.source || "staff",
  createdBy: userId,
  updatedBy: userId,
});

export const createBooking = async (userId, data) => {
  const { business, businessId } = await getBusinessContext(userId);
  const scheduledAt = new Date(data.scheduledAt);
  if (scheduledAt <= new Date()) {
    throw new AppError("Scheduled time must be in the future", 422);
  }

  const [customer, service] = await Promise.all([
    getCustomerForBusiness(businessId, data.customerId),
    getServiceForBusiness(businessId, data.serviceId),
  ]);
  const staff = await getStaffForBusiness(businessId, data.staffId, service);
  const totalAmount =
    data.totalAmount ?? service.discountedPrice ?? service.price;
  if ((data.amountPaid || 0) > totalAmount) {
    throw new AppError("amountPaid cannot exceed totalAmount", 422);
  }

  assertWithinWorkingHours(business, scheduledAt, service.duration);
  await assertNoConflict({
    businessId,
    staffId: staff?._id,
    scheduledAt,
    duration: service.duration,
    bufferBefore: service.bufferBefore,
    bufferAfter: service.bufferAfter,
  });

  const booking = await Booking.create(
    buildBookingData({
      businessId,
      customer,
      service,
      staff,
      scheduledAt,
      data,
      userId,
    }),
  );

  customer.totalAppointments += 1;
  customer.lastUpdatedBy = userId;
  await customer.save();

  service.analytics.totalBookings += 1;
  await service.save();

  return booking;
};

export const listBookings = async (userId, options = {}) => {
  const { businessId } = await getBusinessContext(userId);
  const {
    page = 1,
    limit = 20,
    status,
    customerId,
    serviceId,
    staffId,
    paymentStatus,
    dateFrom,
    dateTo,
    sortOrder = "asc",
  } = options;

  const filter = { businessId, deletedAt: null };
  if (status) filter.status = status;
  if (customerId) filter.customerId = customerId;
  if (serviceId) filter.serviceId = serviceId;
  if (staffId) filter.staffId = staffId;
  if (paymentStatus) filter.paymentStatus = paymentStatus;
  if (dateFrom || dateTo) {
    filter.scheduledAt = {};
    if (dateFrom) filter.scheduledAt.$gte = new Date(dateFrom);
    if (dateTo) filter.scheduledAt.$lte = new Date(dateTo);
  }

  const safePage = Number(page);
  const safeLimit = Number(limit);
  const direction = sortOrder === "desc" ? -1 : 1;
  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .sort({ scheduledAt: direction })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .populate("customerId", "name phone")
      .populate("serviceId", "name duration price")
      .populate("staffId", "name"),
    Booking.countDocuments(filter),
  ]);

  return {
    bookings,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      pages: Math.ceil(total / safeLimit),
    },
  };
};

export const getDailySchedule = async (userId, dateValue) => {
  const { businessId } = await getBusinessContext(userId);
  const karachiDate =
    dateValue ||
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Karachi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  const start = new Date(`${karachiDate}T00:00:00+05:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);

  return Booking.find({
    businessId,
    deletedAt: null,
    scheduledAt: { $gte: start, $lte: end },
    status: { $ne: "cancelled" },
  })
    .sort({ scheduledAt: 1 })
    .populate("customerId", "name phone")
    .populate("serviceId", "name duration price")
    .populate("staffId", "name");
};

export const getBooking = async (userId, bookingId) => {
  const { businessId } = await getBusinessContext(userId);
  return findBookingForBusiness(businessId, bookingId).then((booking) =>
    booking.populate([
      { path: "customerId", select: "name phone email" },
      { path: "serviceId", select: "name duration price category" },
      { path: "staffId", select: "name phone" },
    ]),
  );
};

export const updateBooking = async (userId, bookingId, updates) => {
  const { business, businessId } = await getBusinessContext(userId);
  const booking = await findBookingForBusiness(businessId, bookingId);

  if (
    ["completed", "cancelled", "no_show", "rescheduled"].includes(
      booking.status,
    )
  ) {
    throw new AppError("Terminal bookings cannot be edited.", 409);
  }

  let service = await getServiceForBusiness(businessId, booking.serviceId);
  let staff = booking.staffId
    ? await getStaffForBusiness(businessId, booking.staffId, service)
    : null;

  if (updates.staffId !== undefined) {
    staff = await getStaffForBusiness(businessId, updates.staffId, service);
  }
  const scheduledAt = updates.scheduledAt
    ? new Date(updates.scheduledAt)
    : booking.scheduledAt;

  if (scheduledAt <= new Date()) {
    throw new AppError("Scheduled time must be in the future", 422);
  }
  assertWithinWorkingHours(business, scheduledAt, service.duration);
  await assertNoConflict({
    businessId,
    staffId: staff?._id,
    scheduledAt,
    duration: service.duration,
    bufferBefore: service.bufferBefore,
    bufferAfter: service.bufferAfter,
    excludeBookingId: booking._id,
  });

  if (updates.scheduledAt !== undefined) booking.scheduledAt = scheduledAt;
  if (updates.staffId !== undefined) {
    booking.staffId = staff?._id || null;
    booking.staffDetails = staff
      ? { name: staff.name, phone: staff.phone }
      : undefined;
  }
  for (const field of [
    "notes",
    "internalNotes",
    "specialRequests",
    "preferredPaymentMethod",
  ]) {
    if (updates[field] !== undefined) booking[field] = updates[field];
  }
  booking.updatedBy = userId;
  await booking.save();
  return booking;
};

const applyTransitionMetrics = async (booking, nextStatus, userId) => {
  const customer = await Customer.findById(booking.customerId).select(
    "+interactions",
  );
  const service = await Service.findById(booking.serviceId);

  if (nextStatus === "completed") {
    customer.totalVisits += 1;
    customer.totalSpent += booking.totalAmount;
    customer.completedAppointments += 1;
    customer.lastVisit = new Date();
    service.analytics.completedBookings += 1;
    service.analytics.revenue += booking.totalAmount;
  } else if (nextStatus === "cancelled") {
    customer.cancelledAppointments += 1;
  } else if (nextStatus === "no_show") {
    customer.noShowCount += 1;
  }

  customer.lastUpdatedBy = userId;
  await Promise.all([customer.save(), service.save()]);
};

export const updateBookingStatus = async (
  userId,
  bookingId,
  nextStatus,
  data = {},
) => {
  const { businessId } = await getBusinessContext(userId);
  const booking = await findBookingForBusiness(businessId, bookingId);

  if (!(STATUS_TRANSITIONS[booking.status] || []).includes(nextStatus)) {
    throw new AppError(
      `Booking cannot move from ${booking.status} to ${nextStatus}.`,
      409,
    );
  }

  booking.status = nextStatus;
  booking.updatedBy = userId;

  if (nextStatus === "cancelled") {
    booking.cancellationReason = data.reason;
    booking.cancellationNotes = data.notes || "";
    booking.cancelledAt = new Date();
    booking.cancelledBy = userId;
    if (booking.whatsapp?.reminder) {
      booking.whatsapp.reminder.status = "failed";
    }
  }
  if (nextStatus === "completed") {
    booking.completedAt = new Date();
    if (data.feedback) {
      booking.feedback = { ...data.feedback, submittedAt: new Date() };
    }
  }

  await booking.save();
  await applyTransitionMetrics(booking, nextStatus, userId);
  return booking;
};

export const rescheduleBooking = async (userId, bookingId, newScheduledAt) => {
  const { business, businessId } = await getBusinessContext(userId);
  const booking = await findBookingForBusiness(businessId, bookingId);
  if (!["pending", "confirmed"].includes(booking.status)) {
    throw new AppError(
      "Only pending or confirmed bookings can be rescheduled.",
      409,
    );
  }

  const scheduledAt = new Date(newScheduledAt);
  if (scheduledAt <= new Date()) {
    throw new AppError("New scheduled time must be in the future", 422);
  }

  const service = await getServiceForBusiness(businessId, booking.serviceId);
  assertWithinWorkingHours(business, scheduledAt, service.duration);
  await assertNoConflict({
    businessId,
    staffId: booking.staffId,
    scheduledAt,
    duration: service.duration,
    bufferBefore: service.bufferBefore,
    bufferAfter: service.bufferAfter,
    excludeBookingId: booking._id,
  });

  const replacement = await Booking.create({
    ...booking.toObject(),
    _id: undefined,
    scheduledAt,
    status: "pending",
    statusHistory: [],
    rescheduledFrom: booking._id,
    rescheduledTo: undefined,
    rescheduleCount: booking.rescheduleCount + 1,
    reminderSent: false,
    reminderSentAt: undefined,
    followUpSent: false,
    followUpSentAt: undefined,
    whatsapp: {},
    createdBy: userId,
    updatedBy: userId,
    createdAt: undefined,
    updatedAt: undefined,
  });

  booking.status = "rescheduled";
  booking.rescheduledTo = replacement._id;
  booking.updatedBy = userId;
  await booking.save();
  return { previousBooking: booking, booking: replacement };
};

export const addPayment = async (userId, bookingId, payment) => {
  const { businessId } = await getBusinessContext(userId);
  const booking = await findBookingForBusiness(businessId, bookingId);

  if (["cancelled", "rescheduled"].includes(booking.status)) {
    throw new AppError("Payments cannot be added to this booking.", 409);
  }
  if (payment.amount > booking.amountDue) {
    throw new AppError(
      `Payment exceeds the outstanding amount (${booking.amountDue}).`,
      422,
    );
  }

  booking.payments.push({
    amount: payment.amount,
    method: payment.method,
    reference: payment.reference,
    notes: payment.notes,
    receivedBy: userId,
  });
  booking.amountPaid += payment.amount;
  booking.updatedBy = userId;
  await booking.save();
  return booking;
};

export const deleteBooking = async (userId, bookingId) => {
  const { businessId } = await getBusinessContext(userId);
  const booking = await findBookingForBusiness(businessId, bookingId);
  if (!["cancelled", "rescheduled"].includes(booking.status)) {
    throw new AppError(
      "Only cancelled or rescheduled bookings can be archived.",
      409,
    );
  }
  booking.deletedAt = new Date();
  booking.deletedBy = userId;
  await booking.save();
  return { id: booking._id };
};
