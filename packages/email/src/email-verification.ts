import { sendMail } from "./transport.js";

interface SendEmailVerificationParams {
  to: string;
  verificationUrl: string;
  userName?: string;
  subject?: string;
  html?: string;
}

export async function sendEmailVerification({
  to,
  verificationUrl,
  userName,
  subject: subjectOverride,
  html: htmlOverride,
}: SendEmailVerificationParams) {
  const from = process.env.EMAIL_FROM || "SecretLobby <noreply@secretlobby.co>";
  const displayName = userName || "there";

  const subject = subjectOverride ?? "Verify your email address";
  const defaultHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color: #1a1a2e; margin-bottom: 16px;">Verify your email address</h2>
        <p style="color: #4a4a6a; line-height: 1.6;">Hi ${displayName},</p>
        <p style="color: #4a4a6a; line-height: 1.6;">Thanks for signing up! Please verify your email address to get started with SecretLobby.</p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${verificationUrl}" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">Verify Email</a>
        </div>
        <p style="color: #4a4a6a; line-height: 1.6; font-size: 14px;">This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
        <p style="color: #9ca3af; font-size: 12px;">If the button doesn't work, copy and paste this link into your browser:<br /><a href="${verificationUrl}" style="color: #2563eb;">${verificationUrl}</a></p>
      </div>
    `;
  const html = htmlOverride ?? defaultHtml;

  await sendMail({ from, to, subject, html });
}
