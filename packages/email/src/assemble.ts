/**
 * Assembles full email HTML from template + header + footer.
 * Uses optional repository (e.g. Prisma) for DB-backed templates; falls back to defaults.
 * Placeholders in templates: {{userName}}, {{inviteUrl}}, {{verificationUrl}}, {{resetUrl}}, {{expiresInDays}}, {{year}}, etc.
 */

import {
  DEFAULT_EMAIL_HEADER_HTML,
  DEFAULT_EMAIL_FOOTER_HTML,
  DEFAULT_EMAIL_WRAPPER_START,
  DEFAULT_EMAIL_WRAPPER_END,
  DEFAULT_INVITATION_BODY_HTML,
  DEFAULT_EMAIL_VERIFICATION_BODY_HTML,
  DEFAULT_PASSWORD_RESET_BODY_HTML,
  DEFAULT_EMAIL_SUBJECTS,
} from "./defaults.js";

export interface EmailTemplateRecord {
  subject: string;
  bodyHtml: string;
}

export interface EmailElementRecord {
  html: string;
}

export interface EmailRepository {
  getTemplate(key: string): Promise<EmailTemplateRecord | null>;
  getElement(key: string): Promise<EmailElementRecord | null>;
}

const DEFAULT_BODIES: Record<string, string> = {
  invitation: DEFAULT_INVITATION_BODY_HTML,
  email_verification: DEFAULT_EMAIL_VERIFICATION_BODY_HTML,
  password_reset: DEFAULT_PASSWORD_RESET_BODY_HTML,
};

function substitute(str: string, variables: Record<string, string | number>): string {
  let out = str;
  for (const [key, value] of Object.entries(variables)) {
    out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value ?? ""));
  }
  return out;
}

/**
 * Build full HTML and subject for a notification email.
 * If repo is provided and template exists, uses DB template + header/footer elements.
 * Otherwise uses built-in defaults. Variables are substituted in subject, body, header, and footer.
 */
export async function getAssembledEmail(
  templateKey: string,
  variables: Record<string, string | number>,
  repo?: EmailRepository
): Promise<{ subject: string; html: string }> {
  const consoleUrl =
    (typeof variables.consoleUrl === "string" && variables.consoleUrl) ||
    process.env.CONSOLE_URL ||
    "https://console.secretlobby.co";

  const vars = {
    ...variables,
    year: variables.year ?? new Date().getFullYear(),
    consoleUrl,
    // Backwards compatibility for older header templates using {{logoUrl}}
    logoUrl: variables.logoUrl ?? `${consoleUrl}/secret-lobby.png`,
  };

  let subject: string;
  let bodyHtml: string;
  let headerHtml: string;
  let footerHtml: string;

  if (repo) {
    const [template, header, footer] = await Promise.all([
      repo.getTemplate(templateKey),
      repo.getElement("header"),
      repo.getElement("footer"),
    ]);

    if (template) {
      subject = substitute(template.subject, vars);
      bodyHtml = substitute(template.bodyHtml, vars);
    } else {
      subject = DEFAULT_EMAIL_SUBJECTS[templateKey as keyof typeof DEFAULT_EMAIL_SUBJECTS] ?? templateKey;
      bodyHtml = DEFAULT_BODIES[templateKey] ?? "";
      bodyHtml = substitute(bodyHtml, vars);
    }

    headerHtml = substitute(header?.html ?? DEFAULT_EMAIL_HEADER_HTML, vars);
    footerHtml = substitute(footer?.html ?? DEFAULT_EMAIL_FOOTER_HTML, vars);
  } else {
    subject = DEFAULT_EMAIL_SUBJECTS[templateKey as keyof typeof DEFAULT_EMAIL_SUBJECTS] ?? templateKey;
    subject = substitute(subject, vars);
    bodyHtml = DEFAULT_BODIES[templateKey] ?? "";
    bodyHtml = substitute(bodyHtml, vars);
    headerHtml = substitute(DEFAULT_EMAIL_HEADER_HTML, vars);
    footerHtml = substitute(DEFAULT_EMAIL_FOOTER_HTML, vars);
  }

  const html =
    DEFAULT_EMAIL_WRAPPER_START +
    headerHtml +
    bodyHtml +
    footerHtml +
    DEFAULT_EMAIL_WRAPPER_END;

  return { subject, html };
}
