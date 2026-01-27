import { useState, useRef, useCallback, useEffect, type RefObject } from "react";
import type HlsType from "hls.js";

// Lazy-loaded hls.js module — avoids SSR issues and ensures browser-only loading.
// Module-level cache so the dynamic import only happens once across all hook instances.
let HlsConstructor: typeof HlsType | null = null;
let hlsLoadPromise: Promise<typeof HlsType | null> | null = null;

function getHls(): Promise<typeof HlsType | null> {
  if (HlsConstructor) return Promise.resolve(HlsConstructor);
  if (typeof window === "undefined") return Promise.resolve(null);
  if (hlsLoadPromise) return hlsLoadPromise;

  hlsLoadPromise = import("hls.js")
    .then((mod) => {
      HlsConstructor = mod.default;
      return HlsConstructor;
    })
    .catch(() => null);

  return hlsLoadPromise;
}

interface LoadTrackOptions {
  hlsReady?: boolean;
  duration?: number | null;
  waveformPeaks?: number[] | null;
  visualizerType?: "equalizer" | "waveform";
}

interface HlsAudioReturn {
  loadTrack: (trackId: string, preloadToken?: string, options?: LoadTrackOptions) => Promise<boolean>;
  continueDownload: () => void;
  cleanup: () => void;
  seekTo: (time: number) => Promise<void>;
  cancelAutoPlay: () => void;
  isLoading: boolean;
  isSeeking: false;
  loadingProgress: number;
  isReady: boolean;
  error: string | null;
  estimatedDuration: number;
  waveformPeaks: number[] | null;
  // Compat stubs for PlayerView (always safe defaults)
  isAllSegmentsCached: true;
  blobTimeOffset: 0;
  blobHasLastSegment: true;
  isBlobMode: false;
  isExtendingBlobRef: React.RefObject<boolean>;
  lastSaneTimeRef: React.RefObject<number>;
}

/**
 * HLS audio hook.
 *
 * Playback priority (per hls.js recommended pattern):
 *   1. hls.js via MSE  — Chrome, Firefox, Edge, Safari desktop, iOS 17.1+
 *   2. Native HLS      — Safari iOS <17.1 (no MSE / ManagedMediaSource)
 *   3. Direct MP3       — final fallback, or tracks without HLS segments
 *
 * If hls.js encounters a fatal/buffer error during playback (e.g. legacy
 * MP3-in-fMP4 segments that Chrome MSE rejects), the hook automatically
 * falls back to MP3 streaming and re-signals isReady so the UI can resume.
 */
export function useHlsAudio(audioRef: RefObject<HTMLAudioElement | null>): HlsAudioReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimatedDuration, setEstimatedDuration] = useState(0);
  const [waveformPeaks, setWaveformPeaks] = useState<number[] | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(100);

  const hlsRef = useRef<HlsType | null>(null);
  const currentTrackRef = useRef<string | null>(null);
  const preloadTokenRef = useRef<string | null>(null);
  const autoPlayCancelledRef = useRef(false);
  const blobUrlRef = useRef<string | null>(null);

  // Compat stubs (never change)
  const isExtendingBlobRef = useRef(false);
  const lastSaneTimeRef = useRef(0);

  // Pre-load hls.js on mount (client-side only)
  useEffect(() => {
    getHls();
  }, []);

  const cleanup = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    const audio = audioRef.current;
    if (audio) {
      audio.removeAttribute("src");
      audio.load();
    }
    setIsReady(false);
    setIsLoading(false);
    setError(null);
    setEstimatedDuration(0);
    setWaveformPeaks(null);
    setLoadingProgress(100);
    currentTrackRef.current = null;
    preloadTokenRef.current = null;
  }, [audioRef]);

  const loadTrack = useCallback(
    async (
      trackId: string,
      preloadToken?: string,
      options?: LoadTrackOptions
    ): Promise<boolean> => {
      const audio = audioRef.current;
      if (!audio) return false;

      // Clean up previous HLS instance
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      setIsLoading(true);
      setIsReady(false);
      setError(null);
      setLoadingProgress(0);
      autoPlayCancelledRef.current = false;
      currentTrackRef.current = trackId;
      preloadTokenRef.current = preloadToken || null;

      if (options?.waveformPeaks) {
        setWaveformPeaks(options.waveformPeaks);
      } else {
        setWaveformPeaks(null);
      }

      if (options?.duration && options.duration > 0) {
        setEstimatedDuration(options.duration);
      } else {
        setEstimatedDuration(0);
      }

      const preloadQuery = preloadToken
        ? `?preload=${encodeURIComponent(preloadToken)}`
        : "";

      // ---------------------------------------------------------------
      // MP3 fallback — loads the full MP3 directly onto the <audio> src.
      // Can be called at any time (initial load, or mid-playback after
      // an hls.js error). Sets isReady when the browser can play.
      // ---------------------------------------------------------------
      const loadMp3 = (): Promise<boolean> => {
        const mp3Url = `/api/stream-mp3/${trackId}${preloadQuery}`;
        console.log("[useHlsAudio] Falling back to MP3:", mp3Url);
        return new Promise<boolean>((resolve) => {
          const onCanPlay = () => {
            audio.removeEventListener("canplay", onCanPlay);
            audio.removeEventListener("error", onErr);
            setIsLoading(false);
            setIsReady(true);
            if (audio.duration && isFinite(audio.duration) && !options?.duration) {
              setEstimatedDuration(Math.round(audio.duration));
            }
            resolve(true);
          };
          const onErr = () => {
            audio.removeEventListener("canplay", onCanPlay);
            audio.removeEventListener("error", onErr);
            setIsLoading(false);
            setError("Failed to load audio");
            resolve(false);
          };
          audio.addEventListener("canplay", onCanPlay, { once: true });
          audio.addEventListener("error", onErr, { once: true });
          audio.src = mp3Url;
          audio.load();
        });
      };

      // Async MP3 fallback — for use in event handlers that fire after
      // loadTrack has already resolved (e.g. bufferAppendError during
      // playback). Resets state so the UI transitions correctly.
      const switchToMp3 = () => {
        setIsReady(false);
        setIsLoading(true);
        setError(null);
        loadMp3();
      };

      // Track doesn't have HLS segments — stream full MP3
      if (!options?.hlsReady) {
        return loadMp3();
      }

      const playlistUrl = `/api/hls/${trackId}/playlist${preloadQuery}`;

      // ---------------------------------------------------------------
      // Detect Safari — needs blob mode for Web Audio API compatibility.
      // Safari's MSE and native HLS implementations both prevent
      // createMediaElementSource from capturing audio data, but a
      // standard blob: URL source works. This matches the approach
      // that worked at commit 416a553 (useSegmentedAudio blob mode).
      // ---------------------------------------------------------------
      const isSafari =
        typeof navigator !== "undefined" &&
        /Safari/.test(navigator.userAgent) &&
        !/Chrome/.test(navigator.userAgent);

      // ---------------------------------------------------------------
      // 1. Try hls.js (MSE) — works on Chrome, Firefox, Edge.
      // ---------------------------------------------------------------
      const HlsClass = await getHls();
      const hlsJsSupported = HlsClass?.isSupported() ?? false;

      // Safari blob mode is only needed for the equalizer (Web Audio API).
      // When using waveform visualizer, Safari can use hls.js or native HLS directly.
      const needsBlobMode = isSafari && options?.visualizerType !== "waveform";

      if (HlsClass && hlsJsSupported && !needsBlobMode) {
        return new Promise<boolean>((resolve) => {
          const hls = new HlsClass({
            enableWorker: true,
            lowLatencyMode: false,
            maxBufferLength: 30,
            backBufferLength: 90,
          });

          hlsRef.current = hls;
          let initialLoadResolved = false;

          hls.on(HlsClass.Events.MANIFEST_PARSED, () => {
            initialLoadResolved = true;
            setIsLoading(false);
            setIsReady(true);
            resolve(true);
          });

          hls.on(HlsClass.Events.LEVEL_LOADED, (_event, data) => {
            if (data.details.totalduration && !options?.duration) {
              setEstimatedDuration(Math.round(data.details.totalduration));
            }
          });

          hls.on(HlsClass.Events.ERROR, (_event, data) => {
            const d = data.details as string;
            const isBufError =
              d === "bufferAppendError" || d === "bufferAppendingError";

            if (isBufError || data.fatal) {
              console.warn(
                "[useHlsAudio] hls.js error:",
                d,
                data.fatal ? "(fatal)" : "(non-fatal, treating as fatal)"
              );
              hls.destroy();
              hlsRef.current = null;

              if (!initialLoadResolved) {
                initialLoadResolved = true;
                setError(null);
                loadMp3().then(resolve);
              } else {
                switchToMp3();
              }
            }
          });

          hls.loadSource(playlistUrl);
          hls.attachMedia(audio);
        });
      }

      // ---------------------------------------------------------------
      // 2. Safari blob mode — fetch HLS segments, concatenate into a
      //    blob, and set as audio.src. A blob: URL is a standard source
      //    so createMediaElementSource captures audio for the visualiser.
      // ---------------------------------------------------------------
      if (needsBlobMode) {
        console.log("[useHlsAudio] Safari — using blob mode for Web Audio compatibility");
        try {
          // Fetch and parse the m3u8 playlist
          const playlistRes = await fetch(playlistUrl);
          if (!playlistRes.ok) return loadMp3();
          const playlistText = await playlistRes.text();

          // Extract init segment URI from #EXT-X-MAP:URI="..."
          const initMatch = playlistText.match(/#EXT-X-MAP:URI="([^"]+)"/);
          const initUrl = initMatch?.[1];

          // Extract media segment URLs (non-comment lines starting with /)
          const segmentUrls = playlistText
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.startsWith("/"));

          if (!initUrl || segmentUrls.length === 0) return loadMp3();

          // Download init + all media segments
          const allUrls = [initUrl, ...segmentUrls];
          const buffers: ArrayBuffer[] = [];

          for (let i = 0; i < allUrls.length; i++) {
            const res = await fetch(allUrls[i]);
            if (!res.ok) return loadMp3();
            buffers.push(await res.arrayBuffer());
            setLoadingProgress(((i + 1) / allUrls.length) * 100);
          }

          // Concatenate into a single fMP4 blob
          const totalSize = buffers.reduce((sum, b) => sum + b.byteLength, 0);
          const combined = new Uint8Array(totalSize);
          let offset = 0;
          for (const buf of buffers) {
            combined.set(new Uint8Array(buf), offset);
            offset += buf.byteLength;
          }

          if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
          }
          const blob = new Blob([combined], { type: "audio/mp4" });
          const blobUrl = URL.createObjectURL(blob);
          blobUrlRef.current = blobUrl;

          return new Promise<boolean>((resolve) => {
            const onCanPlay = () => {
              audio.removeEventListener("canplay", onCanPlay);
              audio.removeEventListener("error", onErr);
              setIsLoading(false);
              setIsReady(true);
              if (audio.duration && isFinite(audio.duration) && !options?.duration) {
                setEstimatedDuration(Math.round(audio.duration));
              }
              resolve(true);
            };
            const onErr = () => {
              audio.removeEventListener("canplay", onCanPlay);
              audio.removeEventListener("error", onErr);
              if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
                blobUrlRef.current = null;
              }
              loadMp3().then(resolve);
            };
            audio.addEventListener("canplay", onCanPlay, { once: true });
            audio.addEventListener("error", onErr, { once: true });
            audio.src = blobUrl;
            audio.load();
          });
        } catch {
          return loadMp3();
        }
      }

      // ---------------------------------------------------------------
      // 3. Native HLS — non-Safari browsers with native support.
      // ---------------------------------------------------------------
      const nativeHls = audio.canPlayType("application/vnd.apple.mpegurl");
      if (nativeHls) {
        return new Promise<boolean>((resolve) => {
          const onCanPlay = () => {
            audio.removeEventListener("canplay", onCanPlay);
            audio.removeEventListener("error", onError);
            setIsLoading(false);
            setIsReady(true);
            if (audio.duration && isFinite(audio.duration) && !options?.duration) {
              setEstimatedDuration(Math.round(audio.duration));
            }
            resolve(true);
          };
          const onError = () => {
            audio.removeEventListener("canplay", onCanPlay);
            audio.removeEventListener("error", onError);
            loadMp3().then(resolve);
          };
          audio.addEventListener("canplay", onCanPlay, { once: true });
          audio.addEventListener("error", onError, { once: true });
          audio.src = playlistUrl;
          audio.load();
        });
      }

      // ---------------------------------------------------------------
      // 4. No HLS support at all — direct MP3 stream.
      // ---------------------------------------------------------------
      return loadMp3();
    },
    [audioRef]
  );

  const continueDownload = useCallback(() => {
    const trackId = currentTrackRef.current;
    if (!trackId) return;

    const audio = audioRef.current;
    if (!audio) return;

    if (hlsRef.current) {
      hlsRef.current.loadSource(`/api/hls/${trackId}/playlist`);
    } else if (audio.src?.includes("preload=")) {
      const isHls = audio.src.includes("/api/hls/");
      audio.src = isHls
        ? `/api/hls/${trackId}/playlist`
        : `/api/stream-mp3/${trackId}`;
    }
    preloadTokenRef.current = null;
  }, [audioRef]);

  const seekTo = useCallback(
    async (time: number): Promise<void> => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = time;
    },
    [audioRef]
  );

  const cancelAutoPlay = useCallback(() => {
    autoPlayCancelledRef.current = true;
  }, []);

  return {
    loadTrack,
    continueDownload,
    cleanup,
    seekTo,
    cancelAutoPlay,
    isLoading,
    isSeeking: false as const,
    loadingProgress,
    isReady,
    error,
    estimatedDuration,
    waveformPeaks,
    // Compat stubs
    isAllSegmentsCached: true as const,
    blobTimeOffset: 0 as const,
    blobHasLastSegment: true as const,
    isBlobMode: false as const,
    isExtendingBlobRef,
    lastSaneTimeRef,
  };
}
