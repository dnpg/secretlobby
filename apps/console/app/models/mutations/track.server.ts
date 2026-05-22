import { prisma } from "@secretlobby/db";

export async function createTrack(data: {
  lobbyId: string;
  // Phase 6: prefer attaching new tracks to a playlist. Optional for legacy
  // call sites that haven't migrated yet — those tracks will inherit the
  // lobby's default playlist via a future tightening migration.
  playlistId?: string;
  title: string;
  artist?: string | null;
  filename: string;
  mediaId?: string;
  position: number;
}) {
  return prisma.track.create({
    data: {
      lobbyId: data.lobbyId,
      playlistId: data.playlistId,
      title: data.title,
      artist: data.artist,
      filename: data.filename,
      mediaId: data.mediaId,
      position: data.position,
    },
  });
}

export async function updateTrack(
  id: string,
  data: {
    title?: string;
    artist?: string | null;
    filename?: string;
    mediaId?: string;
    // `null` clears the cover; `undefined` leaves it untouched.
    coverMediaId?: string | null;
    position?: number;
  }
) {
  return prisma.track.update({
    where: { id },
    data,
  });
}

export async function deleteTrack(id: string) {
  return prisma.track.delete({
    where: { id },
  });
}

export async function reorderTracks(order: string[]) {
  return prisma.$transaction(
    order.map((id, idx) =>
      prisma.track.update({ where: { id }, data: { position: idx } })
    )
  );
}

export async function swapTrackPositions(
  trackAId: string,
  trackANewPosition: number,
  trackBId: string,
  trackBNewPosition: number
) {
  return prisma.$transaction([
    prisma.track.update({ where: { id: trackAId }, data: { position: trackANewPosition } }),
    prisma.track.update({ where: { id: trackBId }, data: { position: trackBNewPosition } }),
  ]);
}
