import { Router } from "express";
import {
  createService,
  deleteService,
  getService,
  getServiceAnalytics,
  importServices,
  listServices,
  updateService,
} from "../../../controllers/service.controller.js";
import {
  createServiceValidator,
  importServicesValidator,
  listServicesValidator,
  serviceIdValidator,
  updateServiceValidator,
  validate,
} from "../../../utils/validators/service.validator.js";
import {
  requireStaff,
  requireVerifiedEmail,
  verifyToken,
} from "../../../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyToken, requireVerifiedEmail, requireStaff);

router.get("/analytics", getServiceAnalytics);
router.post("/import", importServicesValidator, validate, importServices);
router.get("/", listServicesValidator, validate, listServices);
router.post("/", createServiceValidator, validate, createService);
router.get("/:serviceId", serviceIdValidator, validate, getService);
router.patch(
  "/:serviceId",
  serviceIdValidator,
  updateServiceValidator,
  validate,
  updateService,
);
router.delete("/:serviceId", serviceIdValidator, validate, deleteService);

export default router;
