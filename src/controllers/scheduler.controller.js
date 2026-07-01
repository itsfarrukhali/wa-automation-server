import ApiResponseUtil from "../utils/helpers/apiResponse.utils.js";
import { asyncHandler } from "../utils/helpers/errorHandler.utils.js";
import * as SchedulerService from "../services/scheduler.service.js";
import { getSchedulerWorkerStatus } from "../workers/scheduler.worker.js";

export const getWorkerStatus = asyncHandler(async (req, res) => {
  return ApiResponseUtil.success(res, getSchedulerWorkerStatus());
});

export const getDueScheduledMessages = asyncHandler(async (req, res) => {
  const result = await SchedulerService.getDueScheduledMessages(
    req.user.userId,
    req.query,
  );
  return ApiResponseUtil.success(res, result);
});

export const runDueScheduledMessages = asyncHandler(async (req, res) => {
  const result = await SchedulerService.runDueScheduledMessages(
    req.user.userId,
    req.body,
  );
  return ApiResponseUtil.success(
    res,
    result,
    result.dryRun ? "Scheduler dry run completed" : "Scheduler run completed",
  );
});
