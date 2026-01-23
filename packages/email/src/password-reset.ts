import { getResendClient } from "./client.js";

interface SendPasswordResetEmailParams {
  to: string;
  resetUrl: string;
  userName?: string;
}

export async function sendPasswordResetEmail({ to, resetUrl, userName }: SendPasswordResetEmailParams) {
  const resend = getResendClient();
  const from = process.env.EMAIL_FROM || "SecretLobby <noreply@secretlobby.io>";
  const displayName = userName || "there";

  const { error } = await resend.emails.send({
    from,
    to,
    subject: "Reset your password",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color: #1a1a2e; margin-bottom: 16px;">Reset your password</h2>
        <p style="color: #4a4a6a; line-height: 1.6;">Hi ${displayName},</p>
        <p style="color: #4a4a6a; line-height: 1.6;">We received a request to reset your password. Click the button below to choose a new one:</p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${resetUrl}" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">Reset Password</a>
        </div>
        <p style="color: #4a4a6a; line-height: 1.6; font-size: 14px;">This link will expire in 10 minutes. If you didn't request a password reset, you can safely ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
        <p style="color: #9ca3af; font-size: 12px;">If the button doesn't work, copy and paste this link into your browser:<br /><a href="${resetUrl}" style="color: #2563eb;">${resetUrl}</a></p>
      </div>
    `,
  });

  if (error) {
    console.error("Failed to send password reset email:", error);
    throw new Error("Failed to send password reset email");
  }
}
