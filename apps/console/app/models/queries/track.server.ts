import { prisma } from "@secretlobby/db";

export async function getTracksByLobbyId(lobbyId: string) {
  return prisma.track.findMany({
    where: { lobbyId },
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
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });
}

export async function getLastTrackByLobbyId(lobbyId: string) {
  return prisma.track.findFirst({
    where: { lobbyId },
    orderBy: { position: "desc" },
  });
}

export async function getTrackIdsByLobbyId(lobbyId: string) {
  return prisma.track.findMany({
    where: { lobbyId },
    orderBy: { position: "asc" },
    select: { id: true },
  });
}
