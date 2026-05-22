import { prisma } from "@secretlobby/db";

// Queries used by the access-control admin route. Kept narrow on purpose
// — the loader pulls only the fields the form needs.

export async function getLobbyAccessSettings(lobbyId: string) {
  return prisma.lobby.findUnique({
    where: { id: lobbyId },
    select: {
      id: true,
      name: true,
      title: true,
      password: true,
      passwordRequired: true,
      accessPolicy: true,
      identityEmail: true,
      identityGoogle: true,
      allowedDomains: true,
      isDefault: true,
      slug: true,
      accountId: true,
    },
  });
}

export interface LobbyUserRow {
  id: string;
  email: string;
  status: "PENDING" | "ACTIVE";
  googleSub: string | null;
  magicLinkSentAt: Date | null;
  invitedAt: Date | null;
  firstLoginAt: Date | null;
  lastSeenAt: Date | null;
  createdAt: Date;
}

export async function getLobbyUsers(
  lobbyId: string,
  opts: { limit?: number; offset?: number; search?: string } = {},
): Promise<{ rows: LobbyUserRow[]; total: number }> {
  const where = {
    lobbyId,
    ...(opts.search
      ? { email: { contains: opts.search.trim().toLowerCase(), mode: "insensitive" as const } }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.lobbyUser.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: opts.limit ?? 50,
      skip: opts.offset ?? 0,
      select: {
        id: true,
        email: true,
        status: true,
        googleSub: true,
        magicLinkSentAt: true,
        invitedAt: true,
        firstLoginAt: true,
        lastSeenAt: true,
        createdAt: true,
      },
    }),
    prisma.lobbyUser.count({ where }),
  ]);

  return { rows, total };
}

export async function getLobbyUserById(id: string) {
  return prisma.lobbyUser.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      lobbyId: true,
      status: true,
    },
  });
}
