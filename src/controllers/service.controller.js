import { asyncHandler } from "../utils/helpers/errorHandler.utils.js";
import ApiResponseUtil from "../utils/helpers/apiResponse.utils.js";
import * as ServiceCatalog from "../services/service.service.js";

export const createService = asyncHandler(async (req, res) => {
  const service = await ServiceCatalog.createService(
    req.user.userId,
    req.body,
  );
  return ApiResponseUtil.created(
    res,
    { service },
    "Service created successfully",
  );
});

export const listServices = asyncHandler(async (req, res) => {
  const result = await ServiceCatalog.listServices(
    req.user.userId,
    req.query,
  );
  return ApiResponseUtil.success(res, result);
});

export const getService = asyncHandler(async (req, res) => {
  const service = await ServiceCatalog.getService(
    req.user.userId,
    req.params.serviceId,
  );
  return ApiResponseUtil.success(res, { service });
});

export const updateService = asyncHandler(async (req, res) => {
  const service = await ServiceCatalog.updateService(
    req.user.userId,
    req.params.serviceId,
    req.body,
  );
  return ApiResponseUtil.success(
    res,
    { service },
    "Service updated successfully",
  );
});

export const deleteService = asyncHandler(async (req, res) => {
  const result = await ServiceCatalog.deleteService(
    req.user.userId,
    req.params.serviceId,
  );
  return ApiResponseUtil.success(
    res,
    result,
    "Service archived successfully",
  );
});

export const importServices = asyncHandler(async (req, res) => {
  const result = await ServiceCatalog.importServices(
    req.user.userId,
    req.body.services,
  );
  return ApiResponseUtil.success(
    res,
    result,
    "Service import completed",
    result.failed > 0 ? 207 : 200,
  );
});

export const getServiceAnalytics = asyncHandler(async (req, res) => {
  const analytics = await ServiceCatalog.getServiceAnalytics(req.user.userId);
  return ApiResponseUtil.success(res, { analytics });
});
