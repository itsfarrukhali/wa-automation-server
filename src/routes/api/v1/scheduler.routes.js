import { Router } from "express";
import {
  getDueScheduledMessages,
  getWorkerStatus,
  runDueScheduledMessages,
} from "../../../controllers/scheduler.controller.js";
import {
  dueSchedulerValidator,
  runSchedulerValidator,
  validate,
} from "../../../utils/validators/scheduler.validator.js";
import {
  requireStaff,
  requireVerifiedEmail,
  verifyToken,
} from "../../../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyToken, requireVerifiedEmail, requireStaff);

router.get("/worker/status", getWorkerStatus);
router.get("/due", dueSchedulerValidator, validate, getDueScheduledMessages);
router.post("/run", runSchedulerValidator, validate, runDueScheduledMessages);

export default router;
