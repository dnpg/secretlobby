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
