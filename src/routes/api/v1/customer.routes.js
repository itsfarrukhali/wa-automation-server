import { Router } from "express";
import {
  createCustomer,
  deleteCustomer,
  getCustomer,
  getCustomerBookings,
  importCustomers,
  listCustomers,
  updateCustomer,
} from "../../../controllers/customer.controller.js";
import {
  bookingHistoryValidator,
  createCustomerValidator,
  customerIdValidator,
  importCustomersValidator,
  listCustomersValidator,
  updateCustomerValidator,
  validate,
} from "../../../utils/validators/customer.validator.js";
import {
  requireStaff,
  requireVerifiedEmail,
  verifyToken,
} from "../../../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyToken, requireVerifiedEmail, requireStaff);

router.post("/import", importCustomersValidator, validate, importCustomers);
router.get("/", listCustomersValidator, validate, listCustomers);
router.post("/", createCustomerValidator, validate, createCustomer);
router.get(
  "/:customerId/bookings",
  bookingHistoryValidator,
  validate,
  getCustomerBookings,
);
router.get("/:customerId", customerIdValidator, validate, getCustomer);
router.patch(
  "/:customerId",
  customerIdValidator,
  updateCustomerValidator,
  validate,
  updateCustomer,
);
router.delete("/:customerId", customerIdValidator, validate, deleteCustomer);

export default router;
