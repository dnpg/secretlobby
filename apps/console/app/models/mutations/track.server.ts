import { prisma } from "@secretlobby/db";

export async function createTrack(data: {
  lobbyId: string;
  title: string;
  artist?: string | null;
  filename: string;
  mediaId?: string;
  position: number;
}) {
  return prisma.track.create({
    data: {
      lobbyId: data.lobbyId,
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
