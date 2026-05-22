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
}

export interface UseHlsAudioOptions {
  /**
   * Optional absolute origin (e.g. `https://acme.secretlobby.co`) to prepend
   * to the audio API endpoints. When omitted (the default), the existing
   * relative-URL code path is used — which is what the public lobby app
   * expects since it runs on the same origin as the API routes.
   *
   * The page-builder canvas in the console app sets this to the lobby's
   * origin so that `/api/hls/...` and `/api/stream-mp3/...` requests hit
   * the lobby host instead of the console host.
   */
  apiBaseUrl?: string;
  /**
   * Optional preview token to attach to API requests. When supplied, every
   * URL gets a `?preview={token}` query so the lobby endpoints can bypass
   * the lobby session auth check. Used by the page-builder canvas (which
   * does not have a lobby session for arbitrary lobbies).
   */
  previewToken?: string;
}

interface HlsAudioReturn {
  loadTrack: (trackId: string, preloadToken?: string, options?: LoadTrackOptions) => Promise<boolean>;
  continueDownload: (options?: { waveformPeaks?: number[] | null; duration?: number | null }) => void;
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
  isSafari: boolean;
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
 */
export function useHlsAudio(
  audioRef: RefObject<HTMLAudioElement | null>,
  options?: UseHlsAudioOptions
): HlsAudioReturn {
  // Trim any trailing slash from the base URL so we always end up with a
  // clean `${base}/api/...`. Empty string means "use relative paths" — the
  // default lobby behavior.
  const apiBaseUrl = (options?.apiBaseUrl ?? "").replace(/\/+$/, "");
  const previewTokenForBase = options?.previewToken ?? "";
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

  const isSafari =
    typeof navigator !== "undefined" &&
    /Safari/.test(navigator.userAgent) &&
    !/Chrome/.test(navigator.userAgent);

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

      const queryParts: string[] = [];
      if (preloadToken) {
        queryParts.push(`preload=${encodeURIComponent(preloadToken)}`);
      }
      if (previewTokenForBase) {
        queryParts.push(`preview=${encodeURIComponent(previewTokenForBase)}`);
      }
      const preloadQuery = queryParts.length ? `?${queryParts.join("&")}` : "";

      const loadMp3 = (): Promise<boolean> => {
        const mp3Url = `${apiBaseUrl}/api/stream-mp3/${trackId}${preloadQuery}`;
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

      const switchToMp3 = () => {
        setIsReady(false);
        setIsLoading(true);
        setError(null);
        loadMp3();
      };

      if (!options?.hlsReady) {
        return loadMp3();
      }

      const playlistUrl = `${apiBaseUrl}/api/hls/${trackId}/playlist${preloadQuery}`;

      const HlsClass = await getHls();
      const hlsJsSupported = HlsClass?.isSupported() ?? false;

      if (HlsClass && hlsJsSupported) {
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

      return loadMp3();
    },
    [audioRef, apiBaseUrl, previewTokenForBase]
  );

  const continueDownload = useCallback((options?: { waveformPeaks?: number[] | null; duration?: number | null }) => {
    const trackId = currentTrackRef.current;
    if (!trackId) return;

    const audio = audioRef.current;
    if (!audio) return;

    if (options?.waveformPeaks) {
      setWaveformPeaks(options.waveformPeaks);
    }
    if (options?.duration && options.duration > 0) {
      setEstimatedDuration(options.duration);
    }

    // Re-attach the preview-token query when present so the second request
    // also passes the auth/CORS check on the lobby endpoint. The per-track
    // preload token is intentionally dropped here — this branch fires once
    // the original preload reservation has been consumed.
    const reloadQuery = previewTokenForBase
      ? `?preview=${encodeURIComponent(previewTokenForBase)}`
      : "";

    if (hlsRef.current) {
      hlsRef.current.loadSource(`${apiBaseUrl}/api/hls/${trackId}/playlist${reloadQuery}`);
    } else if (audio.src?.includes("preload=")) {
      // The substring check still works for absolute URLs since the path
      // segment `/api/hls/` is preserved in the full URL.
      const isHls = audio.src.includes("/api/hls/");
      audio.src = isHls
        ? `${apiBaseUrl}/api/hls/${trackId}/playlist${reloadQuery}`
        : `${apiBaseUrl}/api/stream-mp3/${trackId}${reloadQuery}`;
    }
    preloadTokenRef.current = null;
  }, [audioRef, apiBaseUrl, previewTokenForBase]);

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
    isSafari,
    isAllSegmentsCached: true as const,
    blobTimeOffset: 0 as const,
    blobHasLastSegment: true as const,
    isBlobMode: false as const,
    isExtendingBlobRef,
    lastSaneTimeRef,
  };
}
