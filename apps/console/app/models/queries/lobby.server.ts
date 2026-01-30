import { prisma } from "@secretlobby/db";

export async function getDefaultLobbyByAccountId(accountId: string) {
  return prisma.lobby.findFirst({
    where: { accountId, isDefault: true },
  });
}

export async function getDefaultLobbyWithMedia(accountId: string) {
  return prisma.lobby.findFirst({
    where: { accountId, isDefault: true },
    include: {
      backgroundMedia: true,
      backgroundMediaDark: true,
      bannerMedia: true,
      bannerMediaDark: true,
      profileMedia: true,
      profileMediaDark: true,
    },
  });
}

export async function getDefaultLobbyWithTracks(accountId: string) {
  return prisma.lobby.findFirst({
    where: { accountId, isDefault: true },
    include: {
      tracks: {
        orderBy: { position: "asc" },
        include: { media: true },
      },
    },
  });
}

export async function getDefaultLobbyPassword(accountId: string) {
  return prisma.lobby.findFirst({
    where: { accountId, isDefault: true },
    select: { password: true },
  });
}
