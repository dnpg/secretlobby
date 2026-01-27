import { useState, useRef, useCallback, type RefObject } from "react";
import Hls from "hls.js";

interface LoadTrackOptions {
  hlsReady?: boolean;
  duration?: number | null;
  waveformPeaks?: number[] | null;
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
 * HLS-based audio hook. Uses hls.js for non-Safari browsers and native HLS for Safari.
 * Falls back to direct MP3 streaming for tracks without HLS.
 */
export function useHlsAudio(audioRef: RefObject<HTMLAudioElement | null>): HlsAudioReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimatedDuration, setEstimatedDuration] = useState(0);
  const [waveformPeaks, setWaveformPeaks] = useState<number[] | null>(null);

  const hlsRef = useRef<Hls | null>(null);
  const currentTrackRef = useRef<string | null>(null);
  const preloadTokenRef = useRef<string | null>(null);
  const autoPlayCancelledRef = useRef(false);

  // Compat stubs (never change)
  const isExtendingBlobRef = useRef(false);
  const lastSaneTimeRef = useRef(0);

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
      autoPlayCancelledRef.current = false;
      currentTrackRef.current = trackId;
      preloadTokenRef.current = preloadToken || null;

      // Set waveform peaks and duration from options (pre-computed at upload time)
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

      // Build the playlist URL
      const preloadQuery = preloadToken ? `?preload=${encodeURIComponent(preloadToken)}` : "";

      // Fallback: track doesn't have HLS — stream full MP3
      if (!options?.hlsReady) {
        const mp3Url = `/api/stream-mp3/${trackId}${preloadQuery}`;
        return new Promise<boolean>((resolve) => {
          const onCanPlay = () => {
            audio.removeEventListener("canplay", onCanPlay);
            audio.removeEventListener("error", onError);
            setIsLoading(false);
            setIsReady(true);
            // Update duration from audio element if not set
            if (audio.duration && isFinite(audio.duration) && !options?.duration) {
              setEstimatedDuration(Math.round(audio.duration));
            }
            resolve(true);
          };
          const onError = () => {
            audio.removeEventListener("canplay", onCanPlay);
            audio.removeEventListener("error", onError);
            setIsLoading(false);
            setError("Failed to load audio");
            resolve(false);
          };
          audio.addEventListener("canplay", onCanPlay, { once: true });
          audio.addEventListener("error", onError, { once: true });
          audio.src = mp3Url;
          audio.load();
        });
      }

      const playlistUrl = `/api/hls/${trackId}/playlist${preloadQuery}`;

      // Check if Safari supports native HLS
      if (audio.canPlayType("application/vnd.apple.mpegurl")) {
        // Safari: use native HLS
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
            setIsLoading(false);
            setError("Failed to load HLS stream");
            resolve(false);
          };
          audio.addEventListener("canplay", onCanPlay, { once: true });
          audio.addEventListener("error", onError, { once: true });
          audio.src = playlistUrl;
          audio.load();
        });
      }

      // Non-Safari: use hls.js
      if (!Hls.isSupported()) {
        // Fallback to MP3 if hls.js not supported either
        const mp3Url = `/api/stream-mp3/${trackId}${preloadQuery}`;
        return new Promise<boolean>((resolve) => {
          const onCanPlay = () => {
            audio.removeEventListener("canplay", onCanPlay);
            audio.removeEventListener("error", onError);
            setIsLoading(false);
            setIsReady(true);
            resolve(true);
          };
          const onError = () => {
            audio.removeEventListener("canplay", onCanPlay);
            audio.removeEventListener("error", onError);
            setIsLoading(false);
            setError("Browser does not support HLS");
            resolve(false);
          };
          audio.addEventListener("canplay", onCanPlay, { once: true });
          audio.addEventListener("error", onError, { once: true });
          audio.src = mp3Url;
          audio.load();
        });
      }

      return new Promise<boolean>((resolve) => {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          // Don't retry forever
          fragLoadingMaxRetry: 3,
          manifestLoadingMaxRetry: 3,
        });

        hlsRef.current = hls;

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setIsLoading(false);
          setIsReady(true);
          resolve(true);
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            console.error("[useHlsAudio] Fatal HLS error:", data.type, data.details);
            setIsLoading(false);
            setError(`HLS error: ${data.details}`);
            hls.destroy();
            hlsRef.current = null;
            resolve(false);
          }
        });

        // Update duration when level is loaded (contains accurate duration)
        hls.on(Hls.Events.LEVEL_LOADED, (_event, data) => {
          if (data.details.totalduration && !options?.duration) {
            setEstimatedDuration(Math.round(data.details.totalduration));
          }
        });

        hls.loadSource(playlistUrl);
        hls.attachMedia(audio);
      });
    },
    [audioRef]
  );

  const continueDownload = useCallback(() => {
    // After login, the session cookie is set — reload the current track
    // without the preload token so hls.js uses cookie-based auth
    const trackId = currentTrackRef.current;
    if (!trackId) return;

    const audio = audioRef.current;
    if (!audio) return;

    // If using hls.js, rebuild with the cookie-based URL
    if (hlsRef.current) {
      const playlistUrl = `/api/hls/${trackId}/playlist`;
      hlsRef.current.loadSource(playlistUrl);
    } else if (audio.src?.includes("preload=")) {
      // Native HLS (Safari) or MP3 fallback — update URL
      const isHls = audio.src.includes("/api/hls/");
      if (isHls) {
        audio.src = `/api/hls/${trackId}/playlist`;
      } else {
        audio.src = `/api/stream-mp3/${trackId}`;
      }
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
    loadingProgress: 100,
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
