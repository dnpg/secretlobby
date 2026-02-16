import crypto from "crypto";
import { prisma, InvitationStatus } from "@secretlobby/db";
import { getAssembledEmail, sendInvitationEmail } from "@secretlobby/email";
import { createLogger } from "@secretlobby/logger/server";

const logger = createLogger({ service: "super-admin:invitations" });

function generateInviteCode(): string {
  return crypto.randomBytes(32).toString("hex"); // 64 chars
}

function getInviteUrl(code: string): string {
  const consoleUrl = process.env.CONSOLE_URL || "https://console.secretlobby.co";
  return `${consoleUrl}/signup?code=${code}`;
}

export interface CreateInvitationOptions {
  email: string;
  sentBy: string;
  interestedPersonId?: string;
  note?: string;
  expiresInDays?: number;
}

export async function createInvitation(options: CreateInvitationOptions) {
  const { email, sentBy, interestedPersonId, note, expiresInDays = 7 } = options;

  // Check if invitation already exists for this email
  const existingInvitation = await prisma.invitation.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (existingInvitation) {
    if (existingInvitation.status === InvitationStatus.PENDING) {
      throw new Error("An invitation already exists for this email");
    }
    if (existingInvitation.status === InvitationStatus.USED) {
      throw new Error("This email has already been used to create an account");
    }
    // If revoked or expired, we'll create a new one
    await prisma.invitation.delete({ where: { id: existingInvitation.id } });
  }

  const code = generateInviteCode();
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
  const inviteUrl = getInviteUrl(code);

  // Create the invitation
  const invitation = await prisma.invitation.create({
    data: {
      email: email.toLowerCase(),
      code,
      status: InvitationStatus.PENDING,
      sentAt: new Date(),
      expiresAt,
      sentBy,
      note,
      interestedPersonId,
    },
  });

  // Update interested person if linked
  if (interestedPersonId) {
    await prisma.interestedPerson.update({
      where: { id: interestedPersonId },
      data: { inviteSentAt: new Date() },
    });
  }

  // Send the email (use DB templates when available)
  try {
    const repo = {
      getTemplate: (key: string) =>
        prisma.emailTemplate.findUnique({ where: { key } }).then((t) => (t ? { subject: t.subject, bodyHtml: t.bodyHtml } : null)),
      getElement: (key: string) =>
        prisma.emailHtmlElement.findUnique({ where: { key } }).then((e) => (e ? { html: e.html } : null)),
    };
    const consoleUrl = process.env.CONSOLE_URL || "https://console.secretlobby.co";
    const content = await getAssembledEmail(
      "invitation",
      { userName: "there", inviteUrl, expiresInDays, consoleUrl },
      repo
    );
    await sendInvitationEmail({
      to: email,
      inviteUrl,
      expiresInDays,
      subject: content.subject,
      html: content.html,
    });
    logger.info({ email, invitationId: invitation.id }, "Invitation email sent");
  } catch (error) {
    logger.error({ error, email }, "Failed to send invitation email");
    // Don't throw - the invitation was created, we just couldn't send the email
  }

  return { success: true, invitation, inviteUrl };
}

export async function resendInvitation(id: string, sentBy: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { id },
    include: { interestedPerson: true },
  });

  if (!invitation) {
    throw new Error("Invitation not found");
  }

  if (invitation.status === InvitationStatus.USED) {
    throw new Error("This invitation has already been used");
  }

  // Generate new code and expiry
  const newCode = generateInviteCode();
  const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const inviteUrl = getInviteUrl(newCode);

  // Update the invitation
  const updatedInvitation = await prisma.invitation.update({
    where: { id },
    data: {
      code: newCode,
      status: InvitationStatus.PENDING,
      sentAt: new Date(),
      expiresAt: newExpiresAt,
      sentBy,
    },
  });

  // Update interested person if linked
  if (invitation.interestedPersonId) {
    await prisma.interestedPerson.update({
      where: { id: invitation.interestedPersonId },
      data: { inviteSentAt: new Date() },
    });
  }

  // Send the email (use DB templates when available)
  try {
    const userName = invitation.interestedPerson?.name || "there";
    const repo = {
      getTemplate: (key: string) =>
        prisma.emailTemplate.findUnique({ where: { key } }).then((t) => (t ? { subject: t.subject, bodyHtml: t.bodyHtml } : null)),
      getElement: (key: string) =>
        prisma.emailHtmlElement.findUnique({ where: { key } }).then((e) => (e ? { html: e.html } : null)),
    };
    const consoleUrl = process.env.CONSOLE_URL || "https://console.secretlobby.co";
    const content = await getAssembledEmail(
      "invitation",
      { userName, inviteUrl, expiresInDays: 7, consoleUrl },
      repo
    );
    await sendInvitationEmail({
      to: invitation.email,
      inviteUrl,
      userName,
      subject: content.subject,
      html: content.html,
    });
    logger.info({ email: invitation.email, invitationId: id }, "Invitation resent");
  } catch (error) {
    logger.error({ error, email: invitation.email }, "Failed to resend invitation email");
  }

  return { success: true, invitation: updatedInvitation, inviteUrl };
}

export async function revokeInvitation(id: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { id },
  });

  if (!invitation) {
    throw new Error("Invitation not found");
  }

  if (invitation.status === InvitationStatus.USED) {
    throw new Error("Cannot revoke a used invitation");
  }

  await prisma.invitation.update({
    where: { id },
    data: { status: InvitationStatus.REVOKED },
  });

  logger.info({ email: invitation.email, invitationId: id }, "Invitation revoked");

  return { success: true };
}

export async function markInvitationUsed(code: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { code },
  });

  if (!invitation) {
    throw new Error("Invitation not found");
  }

  await prisma.invitation.update({
    where: { id: invitation.id },
    data: {
      status: InvitationStatus.USED,
      usedAt: new Date(),
    },
  });

  // Update interested person if linked
  if (invitation.interestedPersonId) {
    await prisma.interestedPerson.update({
      where: { id: invitation.interestedPersonId },
      data: { convertedAt: new Date() },
    });
  }

  logger.info({ email: invitation.email, invitationId: invitation.id }, "Invitation used");

  return { success: true };
}
