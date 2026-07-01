import { Router } from "express";
import {
  cancelSubscription,
  confirmManualPayment,
  createCheckoutIntent,
  downgradeToFree,
  getSubscription,
  listPlans,
} from "../../../controllers/billing.controller.js";
import {
  checkoutValidator,
  manualPaymentValidator,
  validate,
} from "../../../utils/validators/billing.validator.js";
import {
  requireOwner,
  requireVerifiedEmail,
  verifyToken,
} from "../../../middlewares/auth.middleware.js";

const router = Router();

router.get("/plans", listPlans);

router.use(verifyToken, requireVerifiedEmail, requireOwner);

router.get("/subscription", getSubscription);
router.post("/checkout-intent", checkoutValidator, validate, createCheckoutIntent);
router.post(
  "/manual-payment",
  manualPaymentValidator,
  validate,
  confirmManualPayment,
);
router.post("/cancel", cancelSubscription);
router.post("/downgrade-free", downgradeToFree);

export default router;
