/**
 * Migration script: Generate HLS segments for existing tracks.
 *
 * Run with:
 *   dotenv -e ../../.env -- tsx prisma/scripts/migrate-to-hls.ts
 *
 * This script:
 * 1. Queries all tracks where hlsReady === false
 * 2. Downloads each track's MP3 from R2
 * 3. Runs generateHls to create HLS segments + waveform peaks
 * 4. Updates the track record with hlsReady: true, waveformPeaks, and duration
 */

import { PrismaClient } from "../src/generated/client/index.js";
import { getFile, generateHls } from "@secretlobby/storage";

const prisma = new PrismaClient();

async function main() {
  const tracks = await prisma.track.findMany({
    where: { hlsReady: false },
    select: {
      id: true,
      title: true,
      filename: true,
      lobbyId: true,
      duration: true,
    },
  });

  console.log(`Found ${tracks.length} tracks without HLS.`);

  let success = 0;
  let failed = 0;

  for (const track of tracks) {
    console.log(`\nProcessing: "${track.title}" (${track.id})`);

    try {
      // Download the MP3 from R2
      const file = await getFile(track.filename);
      if (!file) {
        console.error(`  SKIP: Could not download file "${track.filename}"`);
        failed++;
        continue;
      }

      const buffer = Buffer.from(file.body);
      console.log(`  Downloaded: ${(buffer.length / 1024 / 1024).toFixed(1)} MB`);

      // Generate HLS segments
      const result = await generateHls(buffer, track.lobbyId, track.id);
      console.log(`  Generated: ${result.segmentCount} segments, ${result.duration}s, ${result.waveformPeaks.length} peaks`);

      // Update the track record
      await prisma.track.update({
        where: { id: track.id },
        data: {
          hlsReady: true,
          waveformPeaks: result.waveformPeaks,
          duration: result.duration > 0 ? result.duration : track.duration,
        },
      });

      console.log(`  OK`);
      success++;
    } catch (e) {
      console.error(`  FAILED:`, e instanceof Error ? e.message : e);
      failed++;
    }
  }

  console.log(`\nDone. Success: ${success}, Failed: ${failed}`);
}

main()
  .catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
