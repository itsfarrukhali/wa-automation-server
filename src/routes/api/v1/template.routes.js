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
  requireOwner,
  requireStaff,
  requireVerifiedEmail,
  verifyToken,
} from "../../../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyToken, requireVerifiedEmail, requireStaff);

router.get("/", listTemplatesValidator, validate, listTemplates);
router.post("/", requireOwner, createTemplateValidator, validate, createTemplate);
router.get("/stats", requireOwner, getTemplateStats);
router.post("/sync", requireOwner, syncTemplatesFromMeta);
router.patch("/:templateId", requireOwner, updateTemplateValidator, validate, updateTemplate);
router.delete("/:templateId", requireOwner, templateIdValidator, validate, deleteTemplate);
router.post("/:templateId/mark-used", templateIdValidator, validate, markTemplateUsed);

export default router;
