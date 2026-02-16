import { getResendClient } from "./client.js";
import { createLogger, formatError } from "@secretlobby/logger";

const logger = createLogger({ service: "email" });

interface SendInvitationEmailParams {
  to: string;
  inviteUrl: string;
  userName?: string;
  expiresInDays?: number;
  /** When provided, use this subject instead of default */
  subject?: string;
  /** When provided, use this HTML instead of default (e.g. from getAssembledEmail) */
  html?: string;
}

export async function sendInvitationEmail({
  to,
  inviteUrl,
  userName,
  expiresInDays = 7,
  subject: subjectOverride,
  html: htmlOverride,
}: SendInvitationEmailParams) {
  const resend = getResendClient();
  const from = process.env.EMAIL_FROM || "SecretLobby <noreply@secretlobby.co>";
  const displayName = userName || "there";

  const subject =
    subjectOverride ??
    "You're invited to SecretLobby!";
  const defaultHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color: #1a1a2e; margin-bottom: 16px;">You're Invited!</h2>
        <p style="color: #4a4a6a; line-height: 1.6;">Hi ${displayName},</p>
        <p style="color: #4a4a6a; line-height: 1.6;">You've been invited to join SecretLobby - the private music sharing platform for artists. Create your own password-protected lobby and share your unreleased tracks with your fans.</p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${inviteUrl}" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">Create Your Account</a>
        </div>
        <p style="color: #4a4a6a; line-height: 1.6; font-size: 14px;">This invitation link will expire in ${expiresInDays} days and can only be used once.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
        <p style="color: #9ca3af; font-size: 12px;">If the button doesn't work, copy and paste this link into your browser:<br /><a href="${inviteUrl}" style="color: #2563eb;">${inviteUrl}</a></p>
      </div>
    `;
  const html = htmlOverride ?? defaultHtml;

  const { error } = await resend.emails.send({
    from,
    to,
    subject,
    html,
  });

  if (error) {
    logger.error(
      { to, error: formatError(error) },
      "Failed to send invitation email"
    );
    throw new Error("Failed to send invitation email");
  }
}
