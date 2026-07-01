import { Router } from "express";
import {
  getBookingReport,
  getCustomerReport,
  getOverviewReport,
  getRevenueReport,
} from "../../../controllers/report.controller.js";
import {
  dateRangeValidator,
  validate,
} from "../../../utils/validators/report.validator.js";
import {
  requireStaff,
  requireVerifiedEmail,
  verifyToken,
} from "../../../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyToken, requireVerifiedEmail, requireStaff);

router.get("/overview", dateRangeValidator, validate, getOverviewReport);
router.get("/revenue", dateRangeValidator, validate, getRevenueReport);
router.get("/bookings", dateRangeValidator, validate, getBookingReport);
router.get("/customers", getCustomerReport);

export default router;
