import mongoose from "mongoose";
import Customer from "../models/customer.model.js";
import Business from "../models/business/business.model.js";
import { getMyBusiness } from "./business.service.js";
import { AppError } from "../utils/helpers/errorHandler.utils.js";

const DEFAULT_CUSTOMER_LIMIT = 100;
const MAX_IMPORT_SIZE = 500;

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizePhone = (phone) => {
  const cleaned = String(phone || "").replace(/\D/g, "");
  if (cleaned.startsWith("92")) return `+${cleaned}`;
  if (cleaned.startsWith("0")) return `+92${cleaned.slice(1)}`;
  if (cleaned.length === 10 && cleaned.startsWith("3")) return `+92${cleaned}`;
  return String(phone || "").trim();
};

const getBusinessContext = async (userId) => {
  const business = await getMyBusiness(userId);
  return { business, businessId: business._id };
};

const getActiveCustomerCount = (businessId) =>
  Customer.countDocuments({
    businessId,
    status: { $ne: "deleted" },
    deletedAt: null,
  });

const syncCustomerUsage = async (businessId) => {
  const customerCount = await getActiveCustomerCount(businessId);
  await Business.updateOne(
    { _id: businessId },
    { $set: { "plan.usage.customerCount": customerCount } },
  );
  return customerCount;
};

const assertPlanCapacity = async (business, incomingCount = 1) => {
  const customerLimit =
    business.plan?.limits?.customers ?? DEFAULT_CUSTOMER_LIMIT;

  if (customerLimit === -1) return;

  const currentCount = await getActiveCustomerCount(business._id);
  if (currentCount + incomingCount > customerLimit) {
    throw new AppError(
      `Customer limit reached for the ${business.plan?.currentPlan || "free"} plan (${customerLimit}). Upgrade the plan to add more customers.`,
      403,
    );
  }
};

const findCustomerForBusiness = async (
  businessId,
  customerId,
  { includePrivate = false } = {},
) => {
  if (!mongoose.isValidObjectId(customerId)) {
    throw new AppError("Invalid customer ID", 422);
  }

  let query = Customer.findOne({
    _id: customerId,
    businessId,
    status: { $ne: "deleted" },
    deletedAt: null,
  });

  if (includePrivate) {
    query = query.select("+interactions +privateNotes");
  }

  const customer = await query;
  if (!customer) throw new AppError("Customer not found", 404);
  return customer;
};

const translateDuplicateError = (error) => {
  if (error?.code === 11000) {
    throw new AppError(
      "A customer with this phone number already exists for this business.",
      409,
    );
  }
  throw error;
};

export const createCustomer = async (userId, data) => {
  const { business, businessId } = await getBusinessContext(userId);
  await assertPlanCapacity(business);

  try {
    const customer = await Customer.create({
      ...data,
      phone: normalizePhone(data.phone),
      whatsappNumber: data.whatsappNumber
        ? normalizePhone(data.whatsappNumber)
        : undefined,
      businessId,
      source: data.source || "manual",
      lastUpdatedBy: userId,
    });

    await syncCustomerUsage(businessId);
    return customer;
  } catch (error) {
    return translateDuplicateError(error);
  }
};

export const listCustomers = async (userId, options = {}) => {
  const { businessId } = await getBusinessContext(userId);
  const {
    page = 1,
    limit = 20,
    search,
    status,
    tag,
    source,
    whatsappOptIn,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = options;

  const filter = {
    businessId,
    status: status || { $ne: "deleted" },
    deletedAt: null,
  };

  if (search) {
    const pattern = new RegExp(escapeRegex(search.trim()), "i");
    filter.$or = [{ name: pattern }, { phone: pattern }, { email: pattern }];
  }
  if (tag) filter.tags = tag;
  if (source) filter.source = source;
  if (whatsappOptIn !== undefined) {
    filter.whatsappOptIn =
      whatsappOptIn === true || whatsappOptIn === "true";
  }

  const safePage = Number(page);
  const safeLimit = Number(limit);
  const allowedSortFields = new Set([
    "createdAt",
    "name",
    "lastVisit",
    "totalSpent",
    "totalVisits",
  ]);
  const safeSortBy = allowedSortFields.has(sortBy) ? sortBy : "createdAt";
  const direction = sortOrder === "asc" ? 1 : -1;

  const [customers, total] = await Promise.all([
    Customer.find(filter)
      .sort({ [safeSortBy]: direction, _id: direction })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit),
    Customer.countDocuments(filter),
  ]);

  return {
    customers,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      pages: Math.ceil(total / safeLimit),
    },
  };
};

export const getCustomer = async (userId, customerId) => {
  const { businessId } = await getBusinessContext(userId);
  return findCustomerForBusiness(businessId, customerId, {
    includePrivate: true,
  });
};

export const updateCustomer = async (userId, customerId, updates) => {
  const { businessId } = await getBusinessContext(userId);
  const customer = await findCustomerForBusiness(businessId, customerId);

  const allowedFields = [
    "name",
    "phone",
    "whatsappNumber",
    "email",
    "birthdate",
    "anniversary",
    "gender",
    "source",
    "address",
    "preferences",
    "tags",
    "segments",
    "notes",
    "privateNotes",
    "customFields",
    "whatsappOptIn",
    "consentGiven",
    "status",
  ];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      customer[field] =
        field === "phone" || field === "whatsappNumber"
          ? normalizePhone(updates[field])
          : updates[field];
    }
  }

  customer.lastUpdatedBy = userId;

  try {
    await customer.save();
    return customer;
  } catch (error) {
    return translateDuplicateError(error);
  }
};

export const deleteCustomer = async (userId, customerId) => {
  const { businessId } = await getBusinessContext(userId);
  const customer = await findCustomerForBusiness(businessId, customerId);

  customer.status = "deleted";
  customer.deletedAt = new Date();
  customer.deletedBy = userId;
  customer.lastUpdatedBy = userId;
  await customer.save();
  await syncCustomerUsage(businessId);

  return { id: customer._id };
};

export const importCustomers = async (userId, customers) => {
  if (!Array.isArray(customers) || customers.length === 0) {
    throw new AppError("customers must be a non-empty array", 422);
  }
  if (customers.length > MAX_IMPORT_SIZE) {
    throw new AppError(
      `A maximum of ${MAX_IMPORT_SIZE} customers can be imported at once.`,
      422,
    );
  }

  const { business, businessId } = await getBusinessContext(userId);
  await assertPlanCapacity(business, customers.length);

  const result = { imported: 0, failed: 0, errors: [] };

  for (let index = 0; index < customers.length; index += 1) {
    const item = customers[index];
    try {
      await Customer.create({
        ...item,
        businessId,
        phone: normalizePhone(item.phone),
        whatsappNumber: item.whatsappNumber
          ? normalizePhone(item.whatsappNumber)
          : undefined,
        source: "import",
        importedFrom: item.importedFrom || "api",
        lastUpdatedBy: userId,
      });
      result.imported += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push({
        index,
        phone: item?.phone,
        message:
          error?.code === 11000
            ? "Duplicate phone number"
            : error.message || "Import failed",
      });
    }
  }

  await syncCustomerUsage(businessId);
  return result;
};

export const getCustomerBookings = async (
  userId,
  customerId,
  { page = 1, limit = 20, status } = {},
) => {
  const { businessId } = await getBusinessContext(userId);
  await findCustomerForBusiness(businessId, customerId);
  const { default: Booking } = await import("../models/booking.model.js");

  const filter = { businessId, customerId, deletedAt: null };
  if (status) filter.status = status;

  const safePage = Number(page);
  const safeLimit = Number(limit);
  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .sort({ scheduledAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
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
