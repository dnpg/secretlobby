import nodemailer from "nodemailer";
import { getResendClient } from "./client.js";
import { createLogger, formatError } from "@secretlobby/logger";

const logger = createLogger({ service: "email" });

export interface SendMailParams {
  from: string;
  to: string;
  subject: string;
  html: string;
}

/**
 * Send an email using the configured transport.
 * - If SMTP_HOST is set (e.g. local Mailpit): sends via SMTP.
 * - Otherwise uses Resend (production); RESEND_API_KEY must be set.
 */
export async function sendMail({
  from,
  to,
  subject,
  html,
}: SendMailParams): Promise<void> {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT) || 1025;

  if (smtpHost) {
    console.log("Sending email via SMTP", { smtpHost, smtpPort });
    const transport = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: false,
      ...(process.env.SMTP_USER &&
        process.env.SMTP_PASS && {
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        }),
    });
    await transport.sendMail({ from, to, subject, html });
    logger.info({ to, subject }, "Email sent via SMTP");
    return;
  }

  const resend = getResendClient();
  const { error } = await resend.emails.send({ from, to, subject, html });
  if (error) {
    logger.error({ to, error: formatError(error) }, "Failed to send email");
    throw new Error("Failed to send email");
  }
}
