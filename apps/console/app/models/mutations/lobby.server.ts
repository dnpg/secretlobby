import { prisma } from "@secretlobby/db";

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

export async function updateLobbySettings(lobbyId: string, settings: Record<string, unknown>) {
  return prisma.lobby.update({
    where: { id: lobbyId },
    data: { settings },
  });
}

export async function createLobby(data: {
  accountId: string;
  name: string;
  slug: string;
  title: string;
  description?: string;
  isDefault?: boolean;
  isPublished?: boolean;
}) {
  return prisma.lobby.create({
    data: {
      accountId: data.accountId,
      name: data.name,
      slug: data.slug,
      title: data.title,
      description: data.description,
      isDefault: data.isDefault ?? false,
      isPublished: data.isPublished ?? false,
    },
  });
}
