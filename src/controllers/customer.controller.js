import { asyncHandler } from "../utils/helpers/errorHandler.utils.js";
import ApiResponseUtil from "../utils/helpers/apiResponse.utils.js";
import * as CustomerService from "../services/customer.service.js";

export const createCustomer = asyncHandler(async (req, res) => {
  const customer = await CustomerService.createCustomer(
    req.user.userId,
    req.body,
  );
  return ApiResponseUtil.created(
    res,
    { customer },
    "Customer created successfully",
  );
});

export const listCustomers = asyncHandler(async (req, res) => {
  const result = await CustomerService.listCustomers(
    req.user.userId,
    req.query,
  );
  return ApiResponseUtil.success(res, result);
});

export const getCustomer = asyncHandler(async (req, res) => {
  const customer = await CustomerService.getCustomer(
    req.user.userId,
    req.params.customerId,
  );
  return ApiResponseUtil.success(res, { customer });
});

export const updateCustomer = asyncHandler(async (req, res) => {
  const customer = await CustomerService.updateCustomer(
    req.user.userId,
    req.params.customerId,
    req.body,
  );
  return ApiResponseUtil.success(
    res,
    { customer },
    "Customer updated successfully",
  );
});

export const deleteCustomer = asyncHandler(async (req, res) => {
  const result = await CustomerService.deleteCustomer(
    req.user.userId,
    req.params.customerId,
  );
  return ApiResponseUtil.success(
    res,
    result,
    "Customer deleted successfully",
  );
});

export const importCustomers = asyncHandler(async (req, res) => {
  const result = await CustomerService.importCustomers(
    req.user.userId,
    req.body.customers,
  );
  return ApiResponseUtil.success(
    res,
    result,
    "Customer import completed",
    result.failed > 0 ? 207 : 200,
  );
});

export const getCustomerBookings = asyncHandler(async (req, res) => {
  const result = await CustomerService.getCustomerBookings(
    req.user.userId,
    req.params.customerId,
    req.query,
  );
  return ApiResponseUtil.success(res, result);
});
