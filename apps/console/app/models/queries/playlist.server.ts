import { prisma } from "@secretlobby/db";

// =============================================================================
// Single Playlist Queries
// =============================================================================

export async function getPlaylistById(id: string) {
  return prisma.playlist.findUnique({
    where: { id },
  });
}

export async function getPlaylistByIdWithTracks(id: string) {
  return prisma.playlist.findUnique({
    where: { id },
    include: {
      tracks: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          artist: true,
          position: true,
          lobbyId: true,
          playlistId: true,
          mediaId: true,
          coverMediaId: true,
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
              waveformPeaks: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          coverMedia: {
            select: {
              id: true,
              key: true,
              filename: true,
              type: true,
              width: true,
              height: true,
            },
          },
        },
      },
    },
  });
}

// =============================================================================
// Multi-Playlist Queries
// =============================================================================

export async function getPlaylistsByLobbyId(lobbyId: string) {
  return prisma.playlist.findMany({
    where: { lobbyId },
    orderBy: [{ isDefault: "desc" }, { position: "asc" }, { createdAt: "asc" }],
  });
}

export async function getPlaylistsByLobbyIdWithTracks(lobbyId: string) {
  return prisma.playlist.findMany({
    where: { lobbyId },
    orderBy: [{ isDefault: "desc" }, { position: "asc" }, { createdAt: "asc" }],
    include: {
      tracks: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          artist: true,
          position: true,
          lobbyId: true,
          playlistId: true,
          mediaId: true,
          coverMediaId: true,
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
              waveformPeaks: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          coverMedia: {
            select: {
              id: true,
              key: true,
              filename: true,
              type: true,
              width: true,
              height: true,
            },
          },
        },
      },
    },
  });
}

export async function getDefaultPlaylistForLobby(lobbyId: string) {
  return prisma.playlist.findFirst({
    where: { lobbyId, isDefault: true },
  });
}
