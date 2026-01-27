import { useRef, useEffect, useCallback, useMemo } from "react";
import { computeByteFrequencyData } from "~/lib/fft";

interface DecodedTrack {
  sampleRate: number;
  samples: Float32Array; // mono, downmixed
  duration: number;
}

export interface PcmAnalyser {
  getByteFrequencyData(output: Uint8Array): void;
  readonly frequencyBinCount: number;
}

interface UsePcmAnalyserOptions {
  enabled: boolean;
  trackId: string | null;
  audioElement: HTMLAudioElement | null;
  fftSize?: number;
}

/**
 * Fetches the MP3 stream for a track, decodes it to PCM, and provides a
 * `getByteFrequencyData()` method compatible with AnalyserNode.
 *
 * This allows the AudioVisualizer (equalizer) to work on Safari/iOS
 * where `createMediaElementSource` can't capture audio from native
 * HLS or MSE sources. Playback still uses native HLS for instant start
 * and smooth seeking — this hook only handles visualization data.
 *
 * Uses the MP3 stream (not fMP4 HLS segments) because Safari's
 * decodeAudioData doesn't support fragmented MP4.
 */
export function usePcmAnalyser({
  enabled,
  trackId,
  audioElement,
  fftSize = 256,
}: UsePcmAnalyserOptions): PcmAnalyser | null {
  const decodedRef = useRef<DecodedTrack | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const smoothedRef = useRef<Float32Array | null>(null);
  const frequencyBinCount = fftSize >> 1;

  // Fetch and decode the MP3 when enabled + trackId changes
  useEffect(() => {
    if (!enabled || !trackId) {
      decodedRef.current = null;
      smoothedRef.current = null;
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    decodedRef.current = null;
    smoothedRef.current = null;

    (async () => {
      try {
        // Fetch the full MP3 — this happens in the background while
        // playback uses native HLS for instant start.
        const res = await fetch(`/api/stream-mp3/${trackId}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          console.warn("[usePcmAnalyser] MP3 fetch failed:", res.status);
          return;
        }
        const arrayBuffer = await res.arrayBuffer();
        if (controller.signal.aborted) return;

        // Create AudioContext for decoding (reused across tracks).
        // AudioContext can be created outside a user gesture — only
        // resume() requires a gesture, and we don't need it for decoding.
        if (!audioCtxRef.current) {
          audioCtxRef.current = new AudioContext();
        }
        const ctx = audioCtxRef.current;

        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        if (controller.signal.aborted) return;

        // Downmix to mono
        const numChannels = audioBuffer.numberOfChannels;
        const length = audioBuffer.length;
        const mono = new Float32Array(length);

        if (numChannels === 1) {
          mono.set(audioBuffer.getChannelData(0));
        } else {
          const ch0 = audioBuffer.getChannelData(0);
          const ch1 = audioBuffer.getChannelData(1);
          for (let i = 0; i < length; i++) {
            mono[i] = (ch0[i] + ch1[i]) * 0.5;
          }
        }

        decodedRef.current = {
          sampleRate: audioBuffer.sampleRate,
          samples: mono,
          duration: audioBuffer.duration,
        };
        console.log(
          "[usePcmAnalyser] Decoded",
          Math.round(audioBuffer.duration),
          "s at",
          audioBuffer.sampleRate,
          "Hz"
        );
      } catch (err) {
        if (controller.signal.aborted) return;
        console.warn("[usePcmAnalyser] Decode failed:", err);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [enabled, trackId]);

  const getByteFrequencyData = useCallback(
    (output: Uint8Array) => {
      const decoded = decodedRef.current;
      if (!audioElement || !decoded) {
        output.fill(0);
        return;
      }

      const time = audioElement.currentTime;
      const sampleOffset = Math.floor(time * decoded.sampleRate);

      computeByteFrequencyData(
        decoded.samples,
        sampleOffset - (fftSize >> 1), // center the FFT window on current position
        fftSize,
        output,
      );

      // Apply temporal smoothing matching AnalyserNode behavior
      // (smoothingTimeConstant = 0.8): bars rise instantly but decay slowly.
      const binCount = fftSize >> 1;
      if (!smoothedRef.current || smoothedRef.current.length !== binCount) {
        smoothedRef.current = new Float32Array(binCount);
      }
      const smoothed = smoothedRef.current;
      const smoothing = 0.93;
      for (let i = 0; i < binCount; i++) {
        smoothed[i] = Math.max(smoothing * smoothed[i], output[i]);
        output[i] = Math.round(smoothed[i]);
      }
    },
    [audioElement, fftSize]
  );

  return useMemo(() => {
    if (!enabled) return null;
    return { getByteFrequencyData, frequencyBinCount };
  }, [enabled, getByteFrequencyData, frequencyBinCount]);
}
