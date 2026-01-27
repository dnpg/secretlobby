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
 * Get the folder portion of a media key.
 * e.g. "acct123/media/song-abc12345/song-abc12345.mp3" → "acct123/media/song-abc12345"
 */
export function getMediaFolder(mediaKey: string): string {
  const lastSlash = mediaKey.lastIndexOf("/");
  return lastSlash > 0 ? mediaKey.substring(0, lastSlash) : mediaKey;
}

/**
 * Generate HLS segments from an MP3 buffer using FFmpeg.
 * Uploads all output files to R2 under `{mediaFolder}/`.
 * Also extracts waveform peaks for the visualizer.
 */
export async function generateHls(
  mp3Buffer: Buffer,
  mediaFolder: string
): Promise<HlsResult> {
  const workDir = await mkdtemp(join(tmpdir(), "hls-"));

  try {
    const inputPath = join(workDir, "input.mp3");
    const playlistPath = join(workDir, "playlist.m3u8");
    const segmentPattern = join(workDir, "segment%03d.m4s");

    // Write MP3 to temp file
    await writeFile(inputPath, mp3Buffer);

    // Step 1: Generate HLS fMP4 segments with AAC codec.
    // AAC-LC (mp4a.40.2) is the only audio codec universally supported by
    // MediaSource Extensions across Chrome, Firefox, Safari, and Edge.
    // MP3-in-fMP4 fails on Chrome MSE (bufferAppendError).
    await ffmpeg([
      "-i", inputPath,
      "-vn",              // strip any video stream (audio only)
      "-c:a", "aac",      // transcode to AAC-LC
      "-b:a", "128k",     // 128 kbps (Apple HLS spec recommends 32-160k)
      "-ac", "2",         // stereo output
      "-f", "hls",
      "-hls_time", "6",   // 6-second segments (Apple recommendation)
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
    const files = await readdir(workDir);
    const hlsFiles = files.filter(
      (f) => f === "playlist.m3u8" || f === "init.mp4" || f.endsWith(".m4s")
    );

    let segmentCount = 0;
    for (const file of hlsFiles) {
      const filePath = join(workDir, file);
      const fileBuffer = await readFile(filePath);
      const key = `${mediaFolder}/${file}`;

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
 * Delete all HLS files from a media folder in R2.
 * Deletes playlist.m3u8, init.mp4, and segment*.m4s files.
 */
export async function deleteHlsFiles(
  mediaFolder: string
): Promise<void> {
  const prefix = `${mediaFolder}/`;
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
 * Probe the duration of an audio buffer in seconds using FFprobe.
 * Writes to a temp file, probes, then cleans up.
 */
export async function probeAudioDuration(buffer: Buffer): Promise<number> {
  const workDir = await mkdtemp(join(tmpdir(), "probe-"));
  try {
    const inputPath = join(workDir, "input");
    await writeFile(inputPath, buffer);
    return await probeDuration(inputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/**
 * Probe the duration of an audio file in seconds using FFprobe.
 * Accepts a file path to a local file.
 */
export function probeDuration(inputPath: string): Promise<number> {
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
