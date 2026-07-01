import ApiResponseUtil from "../utils/helpers/apiResponse.utils.js";
import { asyncHandler } from "../utils/helpers/errorHandler.utils.js";
import * as StaffService from "../services/staff.service.js";

export const listStaff = asyncHandler(async (req, res) => {
  const result = await StaffService.listStaff(req.user.userId, req.query);
  return ApiResponseUtil.success(res, result);
});

export const createStaff = asyncHandler(async (req, res) => {
  const result = await StaffService.createStaff(req.user.userId, req.body);
  return ApiResponseUtil.created(res, result, "Staff member created");
});

export const getStaff = asyncHandler(async (req, res) => {
  const result = await StaffService.getStaff(
    req.user.userId,
    req.params.staffId,
  );
  return ApiResponseUtil.success(res, result);
});

export const updateStaff = asyncHandler(async (req, res) => {
  const result = await StaffService.updateStaff(
    req.user.userId,
    req.params.staffId,
    req.body,
  );
  return ApiResponseUtil.success(res, result, "Staff member updated");
});

export const setStaffStatus = asyncHandler(async (req, res) => {
  const result = await StaffService.setStaffStatus(
    req.user.userId,
    req.params.staffId,
    req.body.isActive,
  );
  return ApiResponseUtil.success(res, result, "Staff status updated");
});

export const deleteStaff = asyncHandler(async (req, res) => {
  const result = await StaffService.deleteStaff(
    req.user.userId,
    req.params.staffId,
  );
  return ApiResponseUtil.success(res, result, "Staff member removed");
});

export const resetStaffPassword = asyncHandler(async (req, res) => {
  const result = await StaffService.resetStaffPassword(
    req.user.userId,
    req.params.staffId,
    req.body.password,
  );
  return ApiResponseUtil.success(res, result, "Staff password reset");
});
