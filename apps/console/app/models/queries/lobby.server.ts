import { prisma } from "@secretlobby/db";

export async function getDefaultLobbyByAccountId(accountId: string) {
  return prisma.lobby.findFirst({
    where: { accountId, isDefault: true },
  });
}

export async function getDefaultLobbyWithMedia(accountId: string) {
  return prisma.lobby.findFirst({
    where: { accountId, isDefault: true },
    select: {
      id: true,
      name: true,
      slug: true,
      password: true,
      isDefault: true,
      accountId: true,
      title: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      backgroundMedia: {
        select: {
          id: true,
          key: true,
          filename: true,
          type: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      backgroundMediaDark: {
        select: {
          id: true,
          key: true,
          filename: true,
          type: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      bannerMedia: {
        select: {
          id: true,
          key: true,
          filename: true,
          type: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      bannerMediaDark: {
        select: {
          id: true,
          key: true,
          filename: true,
          type: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      profileMedia: {
        select: {
          id: true,
          key: true,
          filename: true,
          type: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      profileMediaDark: {
        select: {
          id: true,
          key: true,
          filename: true,
          type: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });
}

export async function getDefaultLobbyWithTracks(accountId: string) {
  return prisma.lobby.findFirst({
    where: { accountId, isDefault: true },
    select: {
      id: true,
      name: true,
      slug: true,
      password: true,
      isDefault: true,
      accountId: true,
      settings: true,
      title: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      tracks: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          artist: true,
          position: true,
          lobbyId: true,
          mediaId: true,
          createdAt: true,
          updatedAt: true,
          media: {
            select: {
              id: true,
              key: true,
              filename: true,
              type: true,
              hlsReady: true,
              duration: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
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
