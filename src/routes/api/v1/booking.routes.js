import { Router } from "express";
import {
  addPayment,
  createBooking,
  deleteBooking,
  getBooking,
  getDailySchedule,
  listBookings,
  rescheduleBooking,
  updateBooking,
  updateBookingStatus,
} from "../../../controllers/booking.controller.js";
import {
  bookingIdValidator,
  createBookingValidator,
  dailyScheduleValidator,
  listBookingsValidator,
  paymentValidator,
  rescheduleValidator,
  statusValidator,
  updateBookingValidator,
  validate,
} from "../../../utils/validators/booking.validator.js";
import {
  requireStaff,
  requireVerifiedEmail,
  verifyToken,
} from "../../../middlewares/auth.middleware.js";

const router = Router();
router.use(verifyToken, requireVerifiedEmail, requireStaff);

router.get("/schedule", dailyScheduleValidator, validate, getDailySchedule);
router.get("/", listBookingsValidator, validate, listBookings);
router.post("/", createBookingValidator, validate, createBooking);
router.get("/:bookingId", bookingIdValidator, validate, getBooking);
router.patch(
  "/:bookingId",
  bookingIdValidator,
  updateBookingValidator,
  validate,
  updateBooking,
);
router.patch(
  "/:bookingId/status",
  bookingIdValidator,
  statusValidator,
  validate,
  updateBookingStatus,
);
router.post(
  "/:bookingId/reschedule",
  bookingIdValidator,
  rescheduleValidator,
  validate,
  rescheduleBooking,
);
router.post(
  "/:bookingId/payments",
  bookingIdValidator,
  paymentValidator,
  validate,
  addPayment,
);
router.delete("/:bookingId", bookingIdValidator, validate, deleteBooking);

export default router;
