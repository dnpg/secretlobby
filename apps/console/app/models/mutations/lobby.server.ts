import { prisma, Prisma } from "@secretlobby/db";

// =============================================================================
// Lobby Content & Media
// =============================================================================

export async function updateLobbyContent(
  lobbyId: string,
  data: {
    title?: string | null;
    description?: string | null;
  }
) {
  return prisma.lobby.update({
    where: { id: lobbyId },
    data,
  });
}

export async function updateLobbyMedia(
  lobbyId: string,
  field:
    | "backgroundMediaId"
    | "backgroundMediaDarkId"
    | "bannerMediaId"
    | "bannerMediaDarkId"
    | "profileMediaId"
    | "profileMediaDarkId",
  mediaId: string | null
) {
  return prisma.lobby.update({
    where: { id: lobbyId },
    data: { [field]: mediaId },
  });
}

export async function updateLobbyPassword(lobbyId: string, password: string) {
  return prisma.lobby.update({
    where: { id: lobbyId },
    data: { password },
  });
}

// =============================================================================
// Lobby Settings (JSON)
// =============================================================================

export async function updateLobbySettings(lobbyId: string, settings: Record<string, unknown>) {
  return prisma.lobby.update({
    where: { id: lobbyId },
    data: { settings: settings as Prisma.InputJsonValue },
  });
}

export async function mergeLobbySettings(lobbyId: string, updates: Record<string, unknown>) {
  const lobby = await prisma.lobby.findUnique({
    where: { id: lobbyId },
    select: { settings: true },
  });

  const currentSettings = (lobby?.settings as Record<string, unknown>) || {};
  const mergedSettings = { ...currentSettings, ...updates };

  return prisma.lobby.update({
    where: { id: lobbyId },
    data: { settings: mergedSettings as Prisma.InputJsonValue },
  });
}

export async function getLobbySettings(lobbyId: string): Promise<Record<string, unknown>> {
  const lobby = await prisma.lobby.findUnique({
    where: { id: lobbyId },
    select: { settings: true },
  });

  if (!lobby?.settings || typeof lobby.settings !== "object") {
    return {};
  }
  return lobby.settings as Record<string, unknown>;
}

// =============================================================================
// Lobby CRUD
// =============================================================================

export async function createLobby(data: {
  accountId: string;
  name: string;
  slug: string;
  title?: string;
  description?: string;
  isDefault?: boolean;
  isPublished?: boolean;
  settings?: Record<string, unknown>;
}) {
  return prisma.lobby.create({
    data: {
      accountId: data.accountId,
      name: data.name,
      slug: data.slug,
      title: data.title || data.name,
      description: data.description,
      isDefault: data.isDefault ?? false,
      isPublished: data.isPublished ?? false,
      settings: data.settings ? JSON.parse(JSON.stringify(data.settings)) : {},
    },
  });
}

export async function updateLobby(
  lobbyId: string,
  data: {
    name?: string;
    slug?: string;
    title?: string | null;
    description?: string | null;
    isPublished?: boolean;
  }
) {
  return prisma.lobby.update({
    where: { id: lobbyId },
    data,
  });
}

export async function deleteLobby(lobbyId: string) {
  return prisma.lobby.delete({
    where: { id: lobbyId },
  });
}

// =============================================================================
// Default Lobby Management
// =============================================================================

export async function setDefaultLobby(accountId: string, lobbyId: string) {
  // Use a transaction to ensure atomicity
  return prisma.$transaction(async (tx) => {
    // First, unset any existing default lobbies for this account
    await tx.lobby.updateMany({
      where: { accountId, isDefault: true },
      data: { isDefault: false },
    });

    // Set the new default lobby
    const lobby = await tx.lobby.update({
      where: { id: lobbyId },
      data: { isDefault: true },
    });

    // Update the account's defaultLobbyId
    await tx.account.update({
      where: { id: accountId },
      data: { defaultLobbyId: lobbyId },
    });

    return lobby;
  });
}

// =============================================================================
// Lobby Duplication
// =============================================================================

export async function duplicateLobby(
  sourceLobbyId: string,
  newName: string,
  newSlug: string
) {
  const sourceLobby = await prisma.lobby.findUnique({
    where: { id: sourceLobbyId },
    select: {
      accountId: true,
      title: true,
      description: true,
      settings: true,
      backgroundMediaId: true,
      backgroundMediaDarkId: true,
      bannerMediaId: true,
      bannerMediaDarkId: true,
      profileMediaId: true,
      profileMediaDarkId: true,
    },
  });

  if (!sourceLobby) {
    throw new Error("Source lobby not found");
  }

  return prisma.lobby.create({
    data: {
      accountId: sourceLobby.accountId,
      name: newName,
      slug: newSlug,
      title: sourceLobby.title,
      description: sourceLobby.description,
      settings: sourceLobby.settings ? JSON.parse(JSON.stringify(sourceLobby.settings)) : {},
      isDefault: false,
      isPublished: false,
      backgroundMediaId: sourceLobby.backgroundMediaId,
      backgroundMediaDarkId: sourceLobby.backgroundMediaDarkId,
      bannerMediaId: sourceLobby.bannerMediaId,
      bannerMediaDarkId: sourceLobby.bannerMediaDarkId,
      profileMediaId: sourceLobby.profileMediaId,
      profileMediaDarkId: sourceLobby.profileMediaDarkId,
    },
  });
}
