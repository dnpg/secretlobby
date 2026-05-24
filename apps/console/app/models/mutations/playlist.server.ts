import { prisma } from "@secretlobby/db";

// =============================================================================
// Playlist mutations
// =============================================================================

export async function createPlaylist(data: {
  lobbyId: string;
  name: string;
  isDefault?: boolean;
}) {
  // Bump the position to the next available slot per lobby.
  const last = await prisma.playlist.findFirst({
    where: { lobbyId: data.lobbyId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const nextPosition = (last?.position ?? -1) + 1;

  return prisma.playlist.create({
    data: {
      lobbyId: data.lobbyId,
      name: data.name,
      isDefault: data.isDefault ?? false,
      position: nextPosition,
    },
  });
}

export async function updatePlaylist(
  id: string,
  data: { name?: string; position?: number }
) {
  return prisma.playlist.update({
    where: { id },
    data,
  });
}

export async function deletePlaylist(id: string) {
  // Guardrail: never let the caller delete the lobby's default playlist —
  // the player block always falls back to "default", and we want any orphan
  // tracks to remain attached to it.
  const playlist = await prisma.playlist.findUnique({
    where: { id },
    select: { isDefault: true },
  });
  if (!playlist) {
    throw new Error("Playlist not found");
  }
  if (playlist.isDefault) {
    throw new Error("Cannot delete the default playlist");
  }
  return prisma.playlist.delete({ where: { id } });
}

export async function setDefaultPlaylist(lobbyId: string, playlistId: string) {
  return prisma.$transaction([
    prisma.playlist.updateMany({
      where: { lobbyId, NOT: { id: playlistId } },
      data: { isDefault: false },
    }),
    prisma.playlist.update({
      where: { id: playlistId },
      data: { isDefault: true },
    }),
  ]);
}

/**
 * Idempotent: returns the lobby's default playlist if it exists; otherwise
 * creates one and returns it. Also backfills any orphaned tracks (those with
 * `playlistId = NULL` for this lobby) into the default playlist — this
 * handles the case where a database dump is imported with INSERT-only SQL
 * and the original Prisma migration backfill doesn't re-run. Handles a race
 * where two concurrent callers try to create the default at the same time —
 * the unique (lobbyId, name) constraint guarantees one wins, and we fall
 * back to the existing row.
 */
export async function ensureDefaultPlaylistExists(
  lobbyId: string,
  name = "Default"
) {
  let playlist = await prisma.playlist.findFirst({
    where: { lobbyId, isDefault: true },
  });

  if (!playlist) {
    // No default yet — create one. If another request snuck in between the
    // findFirst and create (or there's a non-default playlist with the same
    // name), the unique constraint will throw and we re-fetch.
    try {
      playlist = await prisma.playlist.create({
        data: { lobbyId, name, isDefault: true, position: 0 },
      });
    } catch {
      playlist = await prisma.playlist.findFirst({
        where: { lobbyId, isDefault: true },
      });
      if (!playlist) {
        // Last resort: pick any playlist with the requested name.
        playlist = await prisma.playlist.findUnique({
          where: { lobbyId_name: { lobbyId, name } },
        });
      }
      if (!playlist) throw new Error("Failed to ensure default playlist");
    }
  }

  // Backfill orphaned tracks — tracks that belong to this lobby but have no
  // playlist assigned (playlistId IS NULL). This happens after a database
  // import or when tracks were created before the playlist feature existed.
  // The updateMany is a no-op when every track already has a playlistId.
  await prisma.track.updateMany({
    where: { lobbyId, playlistId: null },
    data: { playlistId: playlist.id },
  });

  return playlist;
}
