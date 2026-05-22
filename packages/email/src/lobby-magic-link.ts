import { sendMail } from "./transport.js";

// Used when a lobby is in PUBLIC mode with identityEmail enabled: the
// visitor has entered their email (and, if passwordRequired, the right
// password), and we're emailing them a one-time link to finish login.
//
// For admin-issued invitations to INVITE_ONLY lobbies, use
// sendLobbyInvitationEmail instead — it has framing geared toward the
// invite case ("you've been invited") rather than self-service login.

interface SendLobbyMagicLinkEmailParams {
  to: string;
  /** Public-facing lobby title, falls back to lobby name. */
  lobbyName: string;
  /** Absolute URL containing the single-use token. */
  magicLinkUrl: string;
  /** Bare hostname (or hostname/path) of the lobby — shown to the user so they can spot phishing. */
  lobbyDisplayHost?: string;
  expiresInDays?: number;
  subject?: string;
  html?: string;
}

export async function sendLobbyMagicLinkEmail({
  to,
  lobbyName,
  magicLinkUrl,
  lobbyDisplayHost,
  expiresInDays = 7,
  subject: subjectOverride,
  html: htmlOverride,
}: SendLobbyMagicLinkEmailParams) {
  const from = process.env.EMAIL_FROM || "SecretLobby <noreply@secretlobby.co>";

  const subject = subjectOverride ?? `Sign in to ${lobbyName}`;
  const hostLine = lobbyDisplayHost
    ? `<p style="color: #4a4a6a; line-height: 1.6;">You're signing in to <strong>${lobbyName}</strong> (${lobbyDisplayHost}).</p>`
    : `<p style="color: #4a4a6a; line-height: 1.6;">You're signing in to <strong>${lobbyName}</strong>.</p>`;
  const defaultHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color: #1a1a2e; margin-bottom: 16px;">Sign in</h2>
        ${hostLine}
        <p style="color: #4a4a6a; line-height: 1.6;">Click the button below to finish signing in. The link only works once — if you need to sign in again later, just request a new one from the lobby's login page.</p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${magicLinkUrl}" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">Open ${lobbyName}</a>
        </div>
        <p style="color: #4a4a6a; line-height: 1.6; font-size: 14px;">This link expires in ${expiresInDays} day${expiresInDays === 1 ? "" : "s"} and can only be used once. If you didn't request it, you can safely ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
        <p style="color: #9ca3af; font-size: 12px;">If the button doesn't work, copy and paste this link into your browser:<br /><a href="${magicLinkUrl}" style="color: #2563eb;">${magicLinkUrl}</a></p>
      </div>
    `;
  const html = htmlOverride ?? defaultHtml;

  await sendMail({ from, to, subject, html });
}
