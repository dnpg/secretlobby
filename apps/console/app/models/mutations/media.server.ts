import { prisma } from "@secretlobby/db";

export async function createMedia(data: {
  accountId: string;
  filename: string;
  key: string;
  mimeType: string;
  size: number;
  type: string;
  width?: number | null;
  height?: number | null;
  provider?: string | null;
  embedUrl?: string | null;
}) {
  return prisma.media.create({
    data: {
      accountId: data.accountId,
      filename: data.filename,
      key: data.key,
      mimeType: data.mimeType,
      size: data.size,
      type: data.type,
      width: data.width,
      height: data.height,
      provider: data.provider,
      embedUrl: data.embedUrl,
    },
  });
}

export async function updateMediaAlt(id: string, alt: string) {
  return prisma.media.update({
    where: { id },
    data: { alt },
  });
}

export async function updateMediaHls(
  id: string,
  data: {
    hlsReady: boolean;
    waveformPeaks?: unknown;
    duration?: number;
  }
) {
  return prisma.media.update({
    where: { id },
    data: {
      hlsReady: data.hlsReady,
      waveformPeaks: data.waveformPeaks,
      duration: data.duration,
    },
  });
}

export async function deleteMedia(id: string) {
  return prisma.media.delete({
    where: { id },
  });
}
