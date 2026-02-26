import { sendMail } from "./transport.js";
import { getAssembledEmail, type EmailRepository } from "./assemble.js";

interface SendFeedbackNotificationEmailParams {
  to: string;
  userName: string;
  userEmail: string;
  accountName: string;
  feedbackType: string;
  feedbackSubject: string;
  feedbackMessage: string;
  superAdminUrl?: string;
  repo?: EmailRepository;
}

/**
 * Send a feedback notification email to the configured admin.
 */
export async function sendFeedbackNotificationEmail({
  to,
  userName,
  userEmail,
  accountName,
  feedbackType,
  feedbackSubject,
  feedbackMessage,
  superAdminUrl,
  repo,
}: SendFeedbackNotificationEmailParams): Promise<void> {
  const from = process.env.EMAIL_FROM || "SecretLobby <noreply@secretlobby.co>";
  const adminUrl = superAdminUrl || process.env.SUPER_ADMIN_URL || "https://admin.secretlobby.co";

  // Format feedback type for display
  const typeDisplayMap: Record<string, string> = {
    BUG_REPORT: "Bug Report",
    FEATURE_REQUEST: "Feature Request",
    GENERAL: "General Feedback",
  };
  const typeDisplay = typeDisplayMap[feedbackType] || feedbackType;

  const variables = {
    "user.name": userName || "Unknown User",
    "user.email": userEmail,
    "account.name": accountName,
    "feedback.type": typeDisplay,
    "feedback.subject": feedbackSubject,
    "feedback.message": feedbackMessage,
    superAdminUrl: adminUrl,
  };

  const { subject, html } = await getAssembledEmail(
    "feedback_notification",
    variables,
    repo
  );

  await sendMail({ from, to, subject, html });
}
