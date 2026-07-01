import ApiResponseUtil from "../utils/helpers/apiResponse.utils.js";
import { asyncHandler } from "../utils/helpers/errorHandler.utils.js";
import * as ReportService from "../services/report.service.js";

export const getOverviewReport = asyncHandler(async (req, res) => {
  const result = await ReportService.getOverviewReport(req.user.userId, req.query);
  return ApiResponseUtil.success(res, result);
});

export const getRevenueReport = asyncHandler(async (req, res) => {
  const result = await ReportService.getRevenueReport(req.user.userId, req.query);
  return ApiResponseUtil.success(res, result);
});

export const getBookingReport = asyncHandler(async (req, res) => {
  const result = await ReportService.getBookingReport(req.user.userId, req.query);
  return ApiResponseUtil.success(res, result);
});

export const getCustomerReport = asyncHandler(async (req, res) => {
  const result = await ReportService.getCustomerReport(req.user.userId);
  return ApiResponseUtil.success(res, result);
});
