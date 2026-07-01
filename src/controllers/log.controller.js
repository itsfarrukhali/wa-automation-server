import ApiResponseUtil from "../utils/helpers/apiResponse.utils.js";
import { asyncHandler } from "../utils/helpers/errorHandler.utils.js";
import * as LogService from "../services/log.service.js";

export const listLogFiles = asyncHandler(async (_req, res) => {
  const result = await LogService.listLogFiles();
  return ApiResponseUtil.success(res, result);
});

export const tailLogFile = asyncHandler(async (req, res) => {
  const result = await LogService.tailLogFile(req.query);
  return ApiResponseUtil.success(res, result);
});
