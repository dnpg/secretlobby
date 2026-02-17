export { getResendClient } from "./client.js";
export { sendMail, type SendMailParams } from "./transport.js";
export { sendPasswordResetEmail } from "./password-reset.js";
export { sendEmailVerification } from "./email-verification.js";
export { sendInvitationEmail } from "./invitation.js";
export {
  getAssembledEmail,
  type EmailRepository,
  type EmailTemplateRecord,
  type EmailElementRecord,
} from "./assemble.js";
export {
  DEFAULT_EMAIL_HEADER_HTML,
  DEFAULT_EMAIL_FOOTER_HTML,
  DEFAULT_EMAIL_WRAPPER_START,
  DEFAULT_EMAIL_WRAPPER_END,
  DEFAULT_INVITATION_BODY_HTML,
  DEFAULT_EMAIL_VERIFICATION_BODY_HTML,
  DEFAULT_PASSWORD_RESET_BODY_HTML,
  DEFAULT_EMAIL_SUBJECTS,
} from "./defaults.js";
