import { prisma } from "@secretlobby/db";

export async function getTracksByLobbyId(lobbyId: string) {
  return prisma.track.findMany({
    where: { lobbyId },
    orderBy: { position: "asc" },
    include: { media: true },
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
