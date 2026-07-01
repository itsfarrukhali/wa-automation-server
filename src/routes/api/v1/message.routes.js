import { Router } from "express";
import {
  getConversationThread,
  getInbox,
  getMessage,
  getMessageAnalytics,
  listMessages,
  markMessageRead,
  sendTemplateMessage,
  sendTextMessage,
} from "../../../controllers/message.controller.js";
import {
  analyticsValidator,
  conversationValidator,
  inboxValidator,
  listMessagesValidator,
  messageIdValidator,
  sendTemplateValidator,
  sendTextValidator,
  validate,
} from "../../../utils/validators/message.validator.js";
import {
  requireStaff,
  requireVerifiedEmail,
  verifyToken,
} from "../../../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyToken, requireVerifiedEmail, requireStaff);

router.get("/analytics", analyticsValidator, validate, getMessageAnalytics);
router.get("/inbox", inboxValidator, validate, getInbox);
router.get(
  "/conversations/:customerId",
  conversationValidator,
  validate,
  getConversationThread,
);
router.get("/", listMessagesValidator, validate, listMessages);
router.post("/text", sendTextValidator, validate, sendTextMessage);
router.post("/template", sendTemplateValidator, validate, sendTemplateMessage);
router.get("/:messageId", messageIdValidator, validate, getMessage);
router.patch("/:messageId/read", messageIdValidator, validate, markMessageRead);

export default router;
