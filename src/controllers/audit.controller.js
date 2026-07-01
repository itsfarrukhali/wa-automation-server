import ApiResponseUtil from "../utils/helpers/apiResponse.utils.js";
import { asyncHandler } from "../utils/helpers/errorHandler.utils.js";
import * as AuditService from "../services/audit.service.js";

export const listAuditLogs = asyncHandler(async (req, res) => {
  const result = await AuditService.listAuditLogs(req.query);
  return ApiResponseUtil.success(res, result);
});
