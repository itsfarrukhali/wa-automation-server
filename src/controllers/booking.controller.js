import { asyncHandler } from "../utils/helpers/errorHandler.utils.js";
import ApiResponseUtil from "../utils/helpers/apiResponse.utils.js";
import * as BookingService from "../services/booking.service.js";

export const createBooking = asyncHandler(async (req, res) => {
  const booking = await BookingService.createBooking(
    req.user.userId,
    req.body,
  );
  return ApiResponseUtil.created(
    res,
    { booking },
    "Booking created successfully",
  );
});

export const listBookings = asyncHandler(async (req, res) => {
  const result = await BookingService.listBookings(
    req.user.userId,
    req.query,
  );
  return ApiResponseUtil.success(res, result);
});

export const getDailySchedule = asyncHandler(async (req, res) => {
  const bookings = await BookingService.getDailySchedule(
    req.user.userId,
    req.query.date,
  );
  return ApiResponseUtil.success(res, { bookings });
});

export const getBooking = asyncHandler(async (req, res) => {
  const booking = await BookingService.getBooking(
    req.user.userId,
    req.params.bookingId,
  );
  return ApiResponseUtil.success(res, { booking });
});

export const updateBooking = asyncHandler(async (req, res) => {
  const booking = await BookingService.updateBooking(
    req.user.userId,
    req.params.bookingId,
    req.body,
  );
  return ApiResponseUtil.success(
    res,
    { booking },
    "Booking updated successfully",
  );
});

export const updateBookingStatus = asyncHandler(async (req, res) => {
  const booking = await BookingService.updateBookingStatus(
    req.user.userId,
    req.params.bookingId,
    req.body.status,
    req.body,
  );
  return ApiResponseUtil.success(
    res,
    { booking },
    `Booking marked as ${req.body.status}`,
  );
});

export const rescheduleBooking = asyncHandler(async (req, res) => {
  const result = await BookingService.rescheduleBooking(
    req.user.userId,
    req.params.bookingId,
    req.body.scheduledAt,
  );
  return ApiResponseUtil.created(res, result, "Booking rescheduled successfully");
});

export const addPayment = asyncHandler(async (req, res) => {
  const booking = await BookingService.addPayment(
    req.user.userId,
    req.params.bookingId,
    req.body,
  );
  return ApiResponseUtil.success(
    res,
    { booking },
    "Payment recorded successfully",
  );
});

export const deleteBooking = asyncHandler(async (req, res) => {
  const result = await BookingService.deleteBooking(
    req.user.userId,
    req.params.bookingId,
  );
  return ApiResponseUtil.success(
    res,
    result,
    "Booking archived successfully",
  );
});
