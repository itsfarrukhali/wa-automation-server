import { Router } from "express";
import {
  createTemplate,
  deleteTemplate,
  getTemplateStats,
  listTemplates,
  markTemplateUsed,
  syncTemplatesFromMeta,
  updateTemplate,
} from "../../../controllers/template.controller.js";
import {
  createTemplateValidator,
  listTemplatesValidator,
  templateIdValidator,
  updateTemplateValidator,
  validate,
} from "../../../utils/validators/template.validator.js";
import {
  requireStaff,
  requireVerifiedEmail,
  verifyToken,
} from "../../../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyToken, requireVerifiedEmail, requireStaff);

router.get("/", listTemplatesValidator, validate, listTemplates);
router.post("/", createTemplateValidator, validate, createTemplate);
router.get("/stats", getTemplateStats);
router.post("/sync", syncTemplatesFromMeta);
router.patch("/:templateId", updateTemplateValidator, validate, updateTemplate);
router.delete("/:templateId", templateIdValidator, validate, deleteTemplate);
router.post("/:templateId/mark-used", templateIdValidator, validate, markTemplateUsed);

export default router;
