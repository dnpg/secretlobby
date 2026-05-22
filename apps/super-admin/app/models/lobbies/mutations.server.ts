import { prisma } from "@secretlobby/db";
import { encryptLobbyPassword } from "@secretlobby/auth/lobby-password";

const SLUG_RE = /^[a-z0-9-]+$/;

export type UpdateLobbyCoreInput = {
  name: string;
  slug: string;
  title: string | null;
  description: string | null;
  isPublished: boolean;
  requiresAuth: boolean;
  password: string | null;
};

export async function updateLobbyCore(
  lobbyId: string,
  accountId: string,
  input: UpdateLobbyCoreInput
): Promise<{ success: true } | { error: string }> {
  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();

  if (!name || name.length < 2) {
    return { error: "Name must be at least 2 characters" };
  }
  if (!slug || slug.length < 2) {
    return { error: "Slug must be at least 2 characters" };
  }
  if (!SLUG_RE.test(slug)) {
    return { error: "Slug can only contain lowercase letters, numbers, and hyphens" };
  }

  const existing = await prisma.lobby.findUnique({
    where: { accountId_slug: { accountId, slug } },
    select: { id: true },
  });
  if (existing && existing.id !== lobbyId) {
    return { error: "A lobby with this slug already exists in this account" };
  }

  const current = await prisma.lobby.findUnique({
    where: { id: lobbyId },
    select: { isPublished: true },
  });
  const wasPublished = current?.isPublished ?? false;
  const publishedAtChange =
    !wasPublished && input.isPublished ? { publishedAt: new Date() } : {};

  await prisma.lobby.update({
    where: { id: lobbyId },
    data: {
      name,
      slug,
      title: input.title?.trim() || null,
      description: input.description?.trim() || null,
      isPublished: input.isPublished,
      requiresAuth: input.requiresAuth,
      // Encrypt before write — see packages/auth/src/lobby-password.server.ts.
      password:
        input.password && input.password.length > 0
          ? encryptLobbyPassword(input.password)
          : null,
      ...publishedAtChange,
    },
  });

  return { success: true };
}

// =============================================================================
// Lobby Access Settings (parity with apps/console — see
// apps/console/app/models/mutations/lobby-access.server.ts for the
// authoritative version. Duplicated here on purpose: super-admin and
// console are separate apps and we don't have a shared mutation
// package. Keep these in sync when the validation evolves.)
// =============================================================================

export type LobbyAccessInput = {
  accessPolicy: "PUBLIC" | "INVITE_ONLY" | "DOMAIN_ALLOWLIST";
  identityEmail: boolean;
  identityGoogle: boolean;
  passwordRequired: boolean;
  allowedDomains: string[];
};

export async function updateLobbyAccessSettings(
  lobbyId: string,
  accountId: string,
  input: LobbyAccessInput,
): Promise<{ success: true } | { error: string }> {
  // Schema-can't-express rules:
  //   1. Non-public lobbies need an identity method (otherwise we can't
  //      tell who's allowed in at runtime).
  //   2. Domain-allowlist mode needs at least one domain or it's
  //      effectively a closed lobby.
  if (
    input.accessPolicy !== "PUBLIC" &&
    !input.identityEmail &&
    !input.identityGoogle
  ) {
    return {
      error:
        "Non-public lobbies need at least one identity method (Email or Google) enabled.",
    };
  }

  const allowedDomains = Array.from(
    new Set(
      input.allowedDomains
        .map((d) => d.trim().toLowerCase())
        .filter((d) => d.length > 0),
    ),
  );
  for (const d of allowedDomains) {
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) {
      return { error: `"${d}" doesn't look like a valid domain.` };
    }
  }
  if (input.accessPolicy === "DOMAIN_ALLOWLIST" && allowedDomains.length === 0) {
    return { error: "Domain-allowlist mode needs at least one domain." };
  }

  // Belt-and-suspenders: confirm the lobby actually belongs to the
  // claimed account before updating. The route already enforces this,
  // but super-admin actions warrant the extra DB check.
  const lobby = await prisma.lobby.findUnique({
    where: { id: lobbyId },
    select: { accountId: true },
  });
  if (!lobby || lobby.accountId !== accountId) {
    return { error: "Lobby not found in this account." };
  }

  await prisma.lobby.update({
    where: { id: lobbyId },
    data: {
      accessPolicy: input.accessPolicy,
      identityEmail: input.identityEmail,
      identityGoogle: input.identityGoogle,
      passwordRequired: input.passwordRequired,
      allowedDomains,
    },
  });

  return { success: true };
}

export async function setAsDefaultLobby(
  accountId: string,
  lobbyId: string
): Promise<{ success: true } | { error: string }> {
  const lobby = await prisma.lobby.findUnique({
    where: { id: lobbyId },
    select: { accountId: true },
  });
  if (!lobby || lobby.accountId !== accountId) {
    return { error: "Lobby not found" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.lobby.updateMany({
      where: { accountId, isDefault: true },
      data: { isDefault: false },
    });
    await tx.lobby.update({
      where: { id: lobbyId },
      data: { isDefault: true },
    });
    await tx.account.update({
      where: { id: accountId },
      data: { defaultLobbyId: lobbyId },
    });
  });

  return { success: true };
}
