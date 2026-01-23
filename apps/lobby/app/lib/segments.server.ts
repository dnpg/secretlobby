import { generateStreamToken } from "./token.server";
import { getFileInfo } from "@secretlobby/storage";

// Segment duration in bytes (~5 seconds of 128kbps audio = ~80KB)
const SEGMENT_SIZE = 80 * 1024;

export interface Segment {
  index: number;
  start: number;
  end: number;
  token: string;
}

export interface Manifest {
  trackId: string;
  totalSize: number;
  segmentSize: number;
  segments: Segment[];
  expiresAt: number;
}

export async function generateManifest(
  trackId: string,
  filename: string
): Promise<Manifest | null> {
  try {
    const fileInfo = await getFileInfo(filename);
    if (!fileInfo) {
      console.error("[segments] getFileInfo returned null for key:", filename);
      return null;
    }

    const totalSize = fileInfo.size;
    const segmentCount = Math.ceil(totalSize / SEGMENT_SIZE);

    const segments: Segment[] = [];

    for (let i = 0; i < segmentCount; i++) {
      const start = i * SEGMENT_SIZE;
      const end = Math.min(start + SEGMENT_SIZE - 1, totalSize - 1);

      // Each segment gets its own token
      const token = generateStreamToken(`${trackId}:${i}`);

      segments.push({
        index: i,
        start,
        end,
        token,
      });
    }

    return {
      trackId,
      totalSize,
      segmentSize: SEGMENT_SIZE,
      segments,
      expiresAt: Date.now() + 55000, // Manifest expires in 55 seconds
    };
  } catch (err) {
    console.error("[segments] generateManifest error:", err);
    return null;
  }
}

export function getSegmentSize(): number {
  return SEGMENT_SIZE;
}
