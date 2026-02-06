import { prisma, InvitationStatus } from "@secretlobby/db";

export interface InterestedFilters {
  filter?: "all" | "not-invited" | "invited" | "converted";
  page?: number;
  pageSize?: number;
}

export interface InvitationFilters {
  filter?: "all" | "pending" | "used" | "expired" | "revoked";
  page?: number;
  pageSize?: number;
}

export async function getInterestedWithPagination(filters: InterestedFilters = {}) {
  const { filter = "all", page = 1, pageSize = 50 } = filters;

  const where: any = {};

  switch (filter) {
    case "not-invited":
      where.inviteSentAt = null;
      break;
    case "invited":
      where.inviteSentAt = { not: null };
      where.convertedAt = null;
      break;
    case "converted":
      where.convertedAt = { not: null };
      break;
  }

  const [interested, total] = await Promise.all([
    prisma.interestedPerson.findMany({
      where,
      include: {
        invitation: {
          select: {
            id: true,
            status: true,
            code: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.interestedPerson.count({ where }),
  ]);

  return {
    interested,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

export async function getInvitationsWithPagination(filters: InvitationFilters = {}) {
  const { filter = "all", page = 1, pageSize = 50 } = filters;

  const where: any = {};
  const now = new Date();

  switch (filter) {
    case "pending":
      where.status = InvitationStatus.PENDING;
      where.expiresAt = { gt: now };
      break;
    case "used":
      where.status = InvitationStatus.USED;
      break;
    case "expired":
      where.OR = [
        { status: InvitationStatus.EXPIRED },
        { status: InvitationStatus.PENDING, expiresAt: { lte: now } },
      ];
      break;
    case "revoked":
      where.status = InvitationStatus.REVOKED;
      break;
  }

  const [invitations, total] = await Promise.all([
    prisma.invitation.findMany({
      where,
      include: {
        interestedPerson: {
          select: {
            id: true,
            name: true,
            source: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.invitation.count({ where }),
  ]);

  return {
    invitations,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

export async function getInvitationStats() {
  const now = new Date();

  const [total, pending, used, expired, revoked] = await Promise.all([
    prisma.invitation.count(),
    prisma.invitation.count({
      where: {
        status: InvitationStatus.PENDING,
        expiresAt: { gt: now },
      },
    }),
    prisma.invitation.count({ where: { status: InvitationStatus.USED } }),
    prisma.invitation.count({
      where: {
        OR: [
          { status: InvitationStatus.EXPIRED },
          { status: InvitationStatus.PENDING, expiresAt: { lte: now } },
        ],
      },
    }),
    prisma.invitation.count({ where: { status: InvitationStatus.REVOKED } }),
  ]);

  const interestedTotal = await prisma.interestedPerson.count();
  const interestedNotInvited = await prisma.interestedPerson.count({
    where: { inviteSentAt: null },
  });
  const interestedConverted = await prisma.interestedPerson.count({
    where: { convertedAt: { not: null } },
  });

  return {
    invitations: { total, pending, used, expired, revoked },
    interested: {
      total: interestedTotal,
      notInvited: interestedNotInvited,
      converted: interestedConverted,
    },
  };
}

export async function getInvitationByCode(code: string) {
  return prisma.invitation.findUnique({
    where: { code },
    include: {
      interestedPerson: true,
    },
  });
}

export async function getInvitationById(id: string) {
  return prisma.invitation.findUnique({
    where: { id },
    include: {
      interestedPerson: true,
    },
  });
}
