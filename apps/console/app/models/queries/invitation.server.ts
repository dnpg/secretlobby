import { prisma, InvitationStatus } from "@secretlobby/db";

export async function getValidInvitationByCode(code: string) {
  if (!code) return null;

  const invitation = await prisma.invitation.findUnique({
    where: { code },
    include: {
      interestedPerson: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!invitation) return null;

  // Check if expired
  if (invitation.expiresAt <= new Date()) {
    return null;
  }

  // Check if already used or revoked
  if (invitation.status !== InvitationStatus.PENDING) {
    return null;
  }

  return invitation;
}

export async function getSystemSettings() {
  const settings = await prisma.systemSettings.findUnique({
    where: { id: "default" },
  });

  return settings;
}
