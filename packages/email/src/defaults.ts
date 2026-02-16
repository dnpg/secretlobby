/**
 * Default email HTML: table-based, inline styles only, works in all major email clients.
 * Brand: white background, black text, accent #ed1b2f.
 * Placeholders: {{userName}}, {{inviteUrl}}, {{verificationUrl}}, {{resetUrl}}, {{expiresInDays}}, {{year}}, {{consoleUrl}}
 */

/** Brand red used for CTAs and links */
export const EMAIL_BRAND_RED = "#ed1b2f";

export const DEFAULT_EMAIL_HEADER_HTML = `<!-- Email Header: white bg, centered logo -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px; margin:0 auto; background-color:#ffffff;">
  <tr>
    <td align="center" style="padding:24px 24px 16px 24px; text-align:center;">
      <img
        src="{{consoleUrl}}/secret-lobby.png"
        alt="SecretLobby"
        width="200"
        height="200"
        style="display:block; border:0; outline:none; text-decoration:none; margin:0 auto; width:200px; height:200px;"
      />
    </td>
  </tr>
</table>`;

export const DEFAULT_EMAIL_FOOTER_HTML = `<!-- Email Footer: white bg, black text -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px; margin:0 auto; background-color:#ffffff;">
  <tr>
    <td style="padding:24px; border-top:1px solid #e5e7eb;">
      <p style="margin:0; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size:12px; color:#111111; line-height:1.5;">
        &copy; {{year}} SecretLobby. All rights reserved.
      </p>
      <p style="margin:8px 0 0 0; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size:12px;">
        <a href="https://secretlobby.co" style="color:#ed1b2f; text-decoration:none;">secretlobby.co</a>
      </p>
    </td>
  </tr>
</table>`;

/** Wrapper: outer table, white background */
export const DEFAULT_EMAIL_WRAPPER_START = `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title></title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin:0; padding:0; -webkit-text-size-adjust:100%; background-color:#ffffff;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;">
    <tr>
      <td align="center" style="padding:20px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px; margin:0 auto; background-color:#ffffff;">`;

export const DEFAULT_EMAIL_WRAPPER_END = `</table>
      </td>
    </tr>
  </table>
</body>
</html>`;

/** Body content for invitation email. Placeholders: {{userName}}, {{inviteUrl}}, {{expiresInDays}} */
export const DEFAULT_INVITATION_BODY_HTML = `<!-- Body: Invitation -->
<tr>
  <td style="padding:32px 24px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color:#ffffff;">
    <h2 style="margin:0 0 16px 0; font-size:24px; font-weight:700; color:#111111;">You're Invited!</h2>
    <p style="margin:0 0 16px 0; font-size:16px; line-height:1.6; color:#111111;">Hi {{userName}},</p>
    <p style="margin:0 0 16px 0; font-size:16px; line-height:1.6; color:#111111;">You've been invited to join SecretLobby — the private music sharing platform for artists. Create your own password-protected lobby and share your unreleased tracks with your fans.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:32px 0;">
      <tr>
        <td align="center">
          <a href="{{inviteUrl}}" style="display:inline-block; background-color:#ed1b2f; color:#ffffff !important; padding:14px 32px; border-radius:8px; text-decoration:none; font-weight:600; font-size:16px;">Create Your Account</a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px 0; font-size:14px; line-height:1.6; color:#111111;">This invitation link will expire in {{expiresInDays}} days and can only be used once.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0 0 0; border-top:1px solid #e5e7eb;">
      <tr>
        <td style="padding-top:16px;">
          <p style="margin:0; font-size:12px; color:#374151;">If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="margin:4px 0 0 0;"><a href="{{inviteUrl}}" style="color:#ed1b2f; word-break:break-all;">{{inviteUrl}}</a></p>
        </td>
      </tr>
    </table>
  </td>
</tr>`;

/** Body content for email verification. Placeholders: {{userName}}, {{verificationUrl}} */
export const DEFAULT_EMAIL_VERIFICATION_BODY_HTML = `<!-- Body: Email verification -->
<tr>
  <td style="padding:32px 24px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color:#ffffff;">
    <h2 style="margin:0 0 16px 0; font-size:24px; font-weight:700; color:#111111;">Verify your email address</h2>
    <p style="margin:0 0 16px 0; font-size:16px; line-height:1.6; color:#111111;">Hi {{userName}},</p>
    <p style="margin:0 0 16px 0; font-size:16px; line-height:1.6; color:#111111;">Thanks for signing up! Please verify your email address to get started with SecretLobby.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:32px 0;">
      <tr>
        <td align="center">
          <a href="{{verificationUrl}}" style="display:inline-block; background-color:#ed1b2f; color:#ffffff !important; padding:14px 32px; border-radius:8px; text-decoration:none; font-weight:600; font-size:16px;">Verify Email</a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px 0; font-size:14px; line-height:1.6; color:#111111;">This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0 0 0; border-top:1px solid #e5e7eb;">
      <tr>
        <td style="padding-top:16px;">
          <p style="margin:0; font-size:12px; color:#374151;">If the button doesn't work, copy and paste this link:</p>
          <p style="margin:4px 0 0 0;"><a href="{{verificationUrl}}" style="color:#ed1b2f; word-break:break-all;">{{verificationUrl}}</a></p>
        </td>
      </tr>
    </table>
  </td>
</tr>`;

/** Body content for password reset. Placeholders: {{userName}}, {{resetUrl}} */
export const DEFAULT_PASSWORD_RESET_BODY_HTML = `<!-- Body: Password reset -->
<tr>
  <td style="padding:32px 24px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color:#ffffff;">
    <h2 style="margin:0 0 16px 0; font-size:24px; font-weight:700; color:#111111;">Reset your password</h2>
    <p style="margin:0 0 16px 0; font-size:16px; line-height:1.6; color:#111111;">Hi {{userName}},</p>
    <p style="margin:0 0 16px 0; font-size:16px; line-height:1.6; color:#111111;">We received a request to reset your password. Click the button below to choose a new one:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:32px 0;">
      <tr>
        <td align="center">
          <a href="{{resetUrl}}" style="display:inline-block; background-color:#ed1b2f; color:#ffffff !important; padding:14px 32px; border-radius:8px; text-decoration:none; font-weight:600; font-size:16px;">Reset Password</a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px 0; font-size:14px; line-height:1.6; color:#111111;">This link will expire in 10 minutes. If you didn't request a password reset, you can safely ignore this email.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0 0 0; border-top:1px solid #e5e7eb;">
      <tr>
        <td style="padding-top:16px;">
          <p style="margin:0; font-size:12px; color:#374151;">If the button doesn't work, copy and paste this link:</p>
          <p style="margin:4px 0 0 0;"><a href="{{resetUrl}}" style="color:#ed1b2f; word-break:break-all;">{{resetUrl}}</a></p>
        </td>
      </tr>
    </table>
  </td>
</tr>`;

export const DEFAULT_EMAIL_SUBJECTS = {
  invitation: "You're invited to SecretLobby!",
  email_verification: "Verify your email address",
  password_reset: "Reset your password",
} as const;
