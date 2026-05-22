import { sendMail } from "./transport.js";

// Used when an admin adds an email to an INVITE_ONLY lobby's access list
// and chooses to notify them. The URL is the same single-use magic link
// the visitor would request themselves later via sendLobbyMagicLinkEmail
// — the difference is purely the framing.

interface SendLobbyInvitationEmailParams {
  to: string;
  /** Public-facing lobby title, falls back to lobby name. */
  lobbyName: string;
  /** Absolute URL containing the single-use token. */
  invitationUrl: string;
  /** Optional display name of the admin who sent the invite. */
  invitedByName?: string;
  expiresInDays?: number;
  subject?: string;
  html?: string;
}

export async function sendLobbyInvitationEmail({
  to,
  lobbyName,
  invitationUrl,
  invitedByName,
  expiresInDays = 7,
  subject: subjectOverride,
  html: htmlOverride,
}: SendLobbyInvitationEmailParams) {
  const from = process.env.EMAIL_FROM || "SecretLobby <noreply@secretlobby.co>";

  const inviter = invitedByName?.trim();
  const subject =
    subjectOverride ??
    (inviter
      ? `${inviter} invited you to ${lobbyName}`
      : `You're invited to ${lobbyName}`);
  const inviterLine = inviter
    ? `<p style="color: #4a4a6a; line-height: 1.6;"><strong>${inviter}</strong> invited you to access <strong>${lobbyName}</strong>.</p>`
    : `<p style="color: #4a4a6a; line-height: 1.6;">You've been invited to access <strong>${lobbyName}</strong>.</p>`;
  const defaultHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color: #1a1a2e; margin-bottom: 16px;">You're invited</h2>
        ${inviterLine}
        <p style="color: #4a4a6a; line-height: 1.6;">Click the button below to accept and open the lobby. The link only works once — after you've signed in we'll keep you logged in on this device. If you ever need to come back on a different device, you can request a fresh link from the lobby's login page.</p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${invitationUrl}" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">Accept invitation</a>
        </div>
        <p style="color: #4a4a6a; line-height: 1.6; font-size: 14px;">This invitation expires in ${expiresInDays} day${expiresInDays === 1 ? "" : "s"} and can only be used once. Please don't forward this email — the link will stop working after the first click.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
        <p style="color: #9ca3af; font-size: 12px;">If the button doesn't work, copy and paste this link into your browser:<br /><a href="${invitationUrl}" style="color: #2563eb;">${invitationUrl}</a></p>
      </div>
    `;
  const html = htmlOverride ?? defaultHtml;

  await sendMail({ from, to, subject, html });
}
