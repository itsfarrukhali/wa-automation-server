import mongoose from "mongoose";
import Service from "../models/service.model.js";
import User from "../models/user.model.js";
import { getMyBusiness } from "./business.service.js";
import { AppError } from "../utils/helpers/errorHandler.utils.js";

const MAX_IMPORT_SIZE = 200;

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getBusinessContext = async (userId) => {
  const business = await getMyBusiness(userId);
  return { business, businessId: business._id };
};

const findServiceForBusiness = async (
  businessId,
  serviceId,
  { includeInactive = false } = {},
) => {
  if (!mongoose.isValidObjectId(serviceId)) {
    throw new AppError("Invalid service ID", 422);
  }

  const filter = { _id: serviceId, businessId };
  if (!includeInactive) filter.isActive = true;

  const service = await Service.findOne(filter);
  if (!service) throw new AppError("Service not found", 404);
  return service;
};

const assertUniqueActiveName = async (
  businessId,
  name,
  excludeServiceId = null,
) => {
  const filter = {
    businessId,
    isActive: true,
    name: new RegExp(`^${escapeRegex(name.trim())}$`, "i"),
  };
  if (excludeServiceId) filter._id = { $ne: excludeServiceId };

  if (await Service.exists(filter)) {
    throw new AppError(
      "An active service with this name already exists.",
      409,
    );
  }
};

const assertAssignedStaffBelongToBusiness = async (
  businessId,
  assignedStaff = [],
) => {
  if (!assignedStaff.length) return;

  const uniqueIds = [...new Set(assignedStaff.map(String))];
  if (uniqueIds.some((id) => !mongoose.isValidObjectId(id))) {
    throw new AppError("assignedStaff contains an invalid user ID", 422);
  }

  const count = await User.countDocuments({
    _id: { $in: uniqueIds },
    businessId,
    isActive: true,
    role: { $in: ["owner", "staff"] },
  });

  if (count !== uniqueIds.length) {
    throw new AppError(
      "Every assigned staff member must be an active user in this business.",
      422,
    );
  }
};

export const createService = async (userId, data) => {
  const { businessId } = await getBusinessContext(userId);
  await assertUniqueActiveName(businessId, data.name);
  await assertAssignedStaffBelongToBusiness(
    businessId,
    data.assignedStaff || [],
  );

  return Service.create({
    ...data,
    businessId,
    createdBy: userId,
    updatedBy: userId,
  });
};

export const listServices = async (userId, options = {}) => {
  const { businessId } = await getBusinessContext(userId);
  const {
    page = 1,
    limit = 20,
    search,
    category,
    isActive,
    isPopular,
    discounted,
    sortBy = "sortOrder",
    sortOrder = "asc",
  } = options;

  const filter = {
    businessId,
    isActive:
      isActive === undefined
        ? true
        : isActive === true || isActive === "true",
  };

  if (search) {
    const pattern = new RegExp(escapeRegex(search.trim()), "i");
    filter.$or = [
      { name: pattern },
      { description: pattern },
      { category: pattern },
    ];
  }
  if (category) filter.category = new RegExp(`^${escapeRegex(category)}$`, "i");
  if (isPopular !== undefined) {
    filter.isPopular = isPopular === true || isPopular === "true";
  }
  if (discounted === true || discounted === "true") {
    const now = new Date();
    filter["discount.isActive"] = true;
    filter["discount.validFrom"] = { $lte: now };
    filter["discount.validUntil"] = { $gte: now };
  }

  const safePage = Number(page);
  const safeLimit = Number(limit);
  const allowedSortFields = new Set([
    "sortOrder",
    "name",
    "price",
    "duration",
    "createdAt",
  ]);
  const safeSortBy = allowedSortFields.has(sortBy) ? sortBy : "sortOrder";
  const direction = sortOrder === "desc" ? -1 : 1;

  const [services, total] = await Promise.all([
    Service.find(filter)
      .sort({ [safeSortBy]: direction, name: 1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit),
    Service.countDocuments(filter),
  ]);

  return {
    services,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      pages: Math.ceil(total / safeLimit),
    },
  };
};

export const getService = async (userId, serviceId) => {
  const { businessId } = await getBusinessContext(userId);
  return findServiceForBusiness(businessId, serviceId);
};

export const updateService = async (userId, serviceId, updates) => {
  const { businessId } = await getBusinessContext(userId);
  const service = await findServiceForBusiness(businessId, serviceId, {
    includeInactive: true,
  });

  if (updates.name !== undefined) {
    await assertUniqueActiveName(businessId, updates.name, service._id);
  }
  if (updates.assignedStaff !== undefined) {
    await assertAssignedStaffBelongToBusiness(
      businessId,
      updates.assignedStaff,
    );
  }

  const allowedFields = [
    "name",
    "description",
    "price",
    "duration",
    "bufferBefore",
    "bufferAfter",
    "assignedStaff",
    "category",
    "subCategory",
    "color",
    "icon",
    "image",
    "isActive",
    "isPopular",
    "sortOrder",
    "whatsappTemplates",
    "discount",
    "addOns",
  ];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) service[field] = updates[field];
  }

  service.updatedBy = userId;
  await service.save();
  return service;
};

export const deleteService = async (userId, serviceId) => {
  const { businessId } = await getBusinessContext(userId);
  const service = await findServiceForBusiness(businessId, serviceId);
  service.isActive = false;
  service.updatedBy = userId;
  await service.save();
  return { id: service._id };
};

export const importServices = async (userId, services) => {
  if (!Array.isArray(services) || services.length === 0) {
    throw new AppError("services must be a non-empty array", 422);
  }
  if (services.length > MAX_IMPORT_SIZE) {
    throw new AppError(
      `A maximum of ${MAX_IMPORT_SIZE} services can be imported at once.`,
      422,
    );
  }

  const { businessId } = await getBusinessContext(userId);
  const result = { imported: 0, failed: 0, errors: [] };

  for (let index = 0; index < services.length; index += 1) {
    const item = services[index];
    try {
      await assertUniqueActiveName(businessId, item.name);
      await assertAssignedStaffBelongToBusiness(
        businessId,
        item.assignedStaff || [],
      );
      await Service.create({
        ...item,
        businessId,
        createdBy: userId,
        updatedBy: userId,
      });
      result.imported += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push({
        index,
        name: item?.name,
        message: error.message || "Import failed",
      });
    }
  }

  return result;
};

export const getServiceAnalytics = async (userId) => {
  const { businessId } = await getBusinessContext(userId);

  const [summary] = await Service.aggregate([
    { $match: { businessId, isActive: true } },
    {
      $group: {
        _id: null,
        totalServices: { $sum: 1 },
        popularServices: {
          $sum: { $cond: ["$isPopular", 1, 0] },
        },
        averagePrice: { $avg: "$price" },
        averageDuration: { $avg: "$duration" },
        totalBookings: { $sum: "$analytics.totalBookings" },
        completedBookings: { $sum: "$analytics.completedBookings" },
        revenue: { $sum: "$analytics.revenue" },
      },
    },
  ]);

  const categories = await Service.aggregate([
    { $match: { businessId, isActive: true } },
    { $group: { _id: "$category", count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
  ]);

  return {
    totalServices: summary?.totalServices || 0,
    popularServices: summary?.popularServices || 0,
    averagePrice: Math.round(summary?.averagePrice || 0),
    averageDuration: Math.round(summary?.averageDuration || 0),
    totalBookings: summary?.totalBookings || 0,
    completedBookings: summary?.completedBookings || 0,
    revenue: summary?.revenue || 0,
    categories: categories.map(({ _id, count }) => ({
      category: _id || "General",
      count,
    })),
  };
};
