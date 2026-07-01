import { Router } from "express";
import {
  createAutomationRule,
  deleteAutomationRule,
  getAutomationRule,
  listAutomationRules,
  updateAutomationRule,
} from "../../../controllers/automation.controller.js";
import {
  createAutomationRuleValidator,
  listAutomationRulesValidator,
  ruleIdValidator,
  updateAutomationRuleValidator,
  validate,
} from "../../../utils/validators/automation.validator.js";
import {
  requireStaff,
  requireVerifiedEmail,
  verifyToken,
} from "../../../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyToken, requireVerifiedEmail, requireStaff);

router.get("/", listAutomationRulesValidator, validate, listAutomationRules);
router.post("/", createAutomationRuleValidator, validate, createAutomationRule);
router.get("/:ruleId", ruleIdValidator, validate, getAutomationRule);
router.patch(
  "/:ruleId",
  ruleIdValidator,
  updateAutomationRuleValidator,
  validate,
  updateAutomationRule,
);
router.delete("/:ruleId", ruleIdValidator, validate, deleteAutomationRule);

export default router;
