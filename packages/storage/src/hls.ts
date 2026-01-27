import { execFile } from "child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { uploadFile, deleteFile, listFiles } from "./r2";

interface HlsResult {
  segmentCount: number;
  duration: number;
  waveformPeaks: number[];
}

/**
 * Generate HLS segments from an MP3 buffer using FFmpeg.
 * Uploads all output files to R2 under `{lobbyId}/hls/{trackId}/`.
 * Also extracts waveform peaks for the visualizer.
 */
export async function generateHls(
  mp3Buffer: Buffer,
  lobbyId: string,
  trackId: string
): Promise<HlsResult> {
  const workDir = await mkdtemp(join(tmpdir(), "hls-"));

  try {
    const inputPath = join(workDir, "input.mp3");
    const playlistPath = join(workDir, "playlist.m3u8");
    const segmentPattern = join(workDir, "segment%03d.m4s");

    // Write MP3 to temp file
    await writeFile(inputPath, mp3Buffer);

    // Step 1: Generate HLS segments (acodec copy — no re-encoding)
    await ffmpeg([
      "-i", inputPath,
      "-acodec", "copy",
      "-hls_time", "6",
      "-hls_segment_type", "fmp4",
      "-hls_list_size", "0",
      "-hls_playlist_type", "vod",
      "-hls_fmp4_init_filename", "init.mp4",
      "-hls_segment_filename", segmentPattern,
      playlistPath,
    ]);

    // Step 2: Extract waveform peaks using FFmpeg (downsample to 8kHz mono s16le)
    const waveformPeaks = await extractWaveformPeaks(inputPath);

    // Step 3: Get duration from FFmpeg probe
    const duration = await probeDuration(inputPath);

    // Step 4: Upload all generated files to R2
    const prefix = `${lobbyId}/hls/${trackId}`;
    const files = await readdir(workDir);
    const hlsFiles = files.filter(
      (f) => f === "playlist.m3u8" || f === "init.mp4" || f.endsWith(".m4s")
    );

    let segmentCount = 0;
    for (const file of hlsFiles) {
      const filePath = join(workDir, file);
      const fileBuffer = await readFile(filePath);
      const key = `${prefix}/${file}`;

      let contentType = "application/octet-stream";
      if (file.endsWith(".m3u8")) contentType = "application/vnd.apple.mpegurl";
      else if (file.endsWith(".mp4")) contentType = "video/mp4";
      else if (file.endsWith(".m4s")) contentType = "video/iso.segment";

      await uploadFile(key, Buffer.from(fileBuffer), contentType);

      if (file.endsWith(".m4s") && file !== "init.mp4") {
        segmentCount++;
      }
    }

    return { segmentCount, duration, waveformPeaks };
  } finally {
    // Clean up temp directory
    await rm(workDir, { recursive: true, force: true });
  }
}

/**
 * Delete all HLS files for a track from R2.
 */
export async function deleteHlsFiles(
  lobbyId: string,
  trackId: string
): Promise<void> {
  const prefix = `${lobbyId}/hls/${trackId}/`;
  const files = await listFiles(prefix);
  for (const file of files) {
    await deleteFile(file);
  }
}

/**
 * Run an FFmpeg command and return a promise.
 */
function ffmpeg(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("ffmpeg", ["-y", ...args], { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`FFmpeg failed: ${stderr || error.message}`));
      } else {
        resolve(stderr); // FFmpeg outputs info to stderr
      }
    });
  });
}

/**
 * Extract waveform peak amplitudes from an MP3 file.
 * Downsamples to 8kHz mono, reads raw PCM, and computes ~200 peak values.
 */
async function extractWaveformPeaks(inputPath: string): Promise<number[]> {
  return new Promise((resolve) => {
    const peakCount = 200;

    execFile(
      "ffmpeg",
      [
        "-i", inputPath,
        "-ac", "1",
        "-ar", "8000",
        "-f", "s16le",
        "-acodec", "pcm_s16le",
        "pipe:1",
      ],
      { maxBuffer: 50 * 1024 * 1024, encoding: "buffer" as BufferEncoding },
      (error, stdout) => {
        if (error) {
          console.error("[hls] Waveform extraction failed:", error.message);
          resolve([]);
          return;
        }

        try {
          const buf = stdout as unknown as Buffer;
          const samples = new Int16Array(
            buf.buffer,
            buf.byteOffset,
            Math.floor(buf.length / 2)
          );

          if (samples.length === 0) {
            resolve([]);
            return;
          }

          const samplesPerPeak = Math.max(1, Math.floor(samples.length / peakCount));
          const peaks: number[] = [];

          for (let i = 0; i < peakCount; i++) {
            const start = i * samplesPerPeak;
            const end = Math.min(start + samplesPerPeak, samples.length);
            let max = 0;

            for (let j = start; j < end; j++) {
              const abs = Math.abs(samples[j]);
              if (abs > max) max = abs;
            }

            peaks.push(max / 32768);
          }

          resolve(peaks);
        } catch (e) {
          console.error("[hls] Waveform peak computation failed:", e);
          resolve([]);
        }
      }
    );
  });
}

/**
 * Probe the duration of an audio file in seconds using FFmpeg.
 */
function probeDuration(inputPath: string): Promise<number> {
  return new Promise((resolve) => {
    execFile(
      "ffprobe",
      [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        inputPath,
      ],
      (error, stdout) => {
        if (error) {
          console.error("[hls] Duration probe failed:", error.message);
          resolve(0);
          return;
        }
        const dur = parseFloat(stdout.trim());
        resolve(isFinite(dur) ? Math.round(dur) : 0);
      }
    );
  });
}
