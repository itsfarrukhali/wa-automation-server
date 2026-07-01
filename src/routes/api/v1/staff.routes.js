import { Router } from "express";
import {
  createStaff,
  deleteStaff,
  getStaff,
  listStaff,
  resetStaffPassword,
  setStaffStatus,
  updateStaff,
} from "../../../controllers/staff.controller.js";
import {
  createStaffValidator,
  listStaffValidator,
  resetStaffPasswordValidator,
  staffIdValidator,
  staffStatusValidator,
  updateStaffValidator,
  validate,
} from "../../../utils/validators/staff.validator.js";
import {
  requireOwner,
  requireVerifiedEmail,
  verifyToken,
} from "../../../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyToken, requireVerifiedEmail, requireOwner);

router.get("/", listStaffValidator, validate, listStaff);
router.post("/", createStaffValidator, validate, createStaff);
router.get("/:staffId", staffIdValidator, validate, getStaff);
router.patch("/:staffId", updateStaffValidator, validate, updateStaff);
router.patch("/:staffId/status", staffStatusValidator, validate, setStaffStatus);
router.post(
  "/:staffId/reset-password",
  resetStaffPasswordValidator,
  validate,
  resetStaffPassword,
);
router.delete("/:staffId", staffIdValidator, validate, deleteStaff);

export default router;
