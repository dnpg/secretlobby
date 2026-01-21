import { useCallback, useRef, useState, useEffect } from "react";

interface Segment {
  index: number;
  start: number;
  end: number;
  token: string;
}

interface Manifest {
  trackId: string;
  totalSize: number;
  segmentSize: number;
  segments: Segment[];
  expiresAt: number;
}

export function useSegmentedAudio(audioRef: React.RefObject<HTMLAudioElement | null>) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const manifestRef = useRef<Manifest | null>(null);
  const loadedSegmentsRef = useRef<Set<number>>(new Set());
  const abortControllerRef = useRef<AbortController | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const isLoadingSegmentRef = useRef(false);

  // Cleanup function
  const cleanup = useCallback(() => {
    abortControllerRef.current?.abort();

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    if (mediaSourceRef.current?.readyState === "open") {
      try {
        mediaSourceRef.current.endOfStream();
      } catch {}
    }

    mediaSourceRef.current = null;
    sourceBufferRef.current = null;
    manifestRef.current = null;
    loadedSegmentsRef.current.clear();
    isLoadingSegmentRef.current = false;
    setIsReady(false);
    setLoadingProgress(0);
  }, []);

  // Fetch manifest
  const fetchManifest = useCallback(async (trackId: string): Promise<Manifest | null> => {
    try {
      const response = await fetch(`/api/manifest/${trackId}`, {
        signal: abortControllerRef.current?.signal,
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }, []);

  // Fetch a single segment
  const fetchSegment = useCallback(async (
    trackId: string,
    segment: Segment
  ): Promise<ArrayBuffer | null> => {
    try {
      const response = await fetch(
        `/api/segment/${trackId}/${segment.index}?t=${segment.token}`,
        { signal: abortControllerRef.current?.signal }
      );
      if (!response.ok) return null;
      return await response.arrayBuffer();
    } catch {
      return null;
    }
  }, []);

  // Append buffer and wait
  const appendBuffer = useCallback((sourceBuffer: SourceBuffer, data: ArrayBuffer): Promise<void> => {
    return new Promise((resolve, reject) => {
      const onUpdate = () => {
        sourceBuffer.removeEventListener("updateend", onUpdate);
        sourceBuffer.removeEventListener("error", onError);
        resolve();
      };
      const onError = () => {
        sourceBuffer.removeEventListener("updateend", onUpdate);
        sourceBuffer.removeEventListener("error", onError);
        reject(new Error("Buffer append error"));
      };

      sourceBuffer.addEventListener("updateend", onUpdate);
      sourceBuffer.addEventListener("error", onError);

      try {
        sourceBuffer.appendBuffer(data);
      } catch (e) {
        sourceBuffer.removeEventListener("updateend", onUpdate);
        sourceBuffer.removeEventListener("error", onError);
        reject(e);
      }
    });
  }, []);

  // Load segments progressively
  const loadSegments = useCallback(async (
    trackId: string,
    manifest: Manifest,
    sourceBuffer: SourceBuffer,
    startIndex: number = 0
  ) => {
    const audio = audioRef.current;

    for (let i = startIndex; i < manifest.segments.length; i++) {
      // Check if aborted
      if (abortControllerRef.current?.signal.aborted) break;

      // Skip already loaded segments
      if (loadedSegmentsRef.current.has(i)) continue;

      // Wait if buffer is updating
      while (sourceBuffer.updating) {
        await new Promise((r) => setTimeout(r, 50));
      }

      // Check if we should pause loading (buffer ahead enough)
      if (audio && audio.buffered.length > 0 && i > 2) {
        const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);
        const currentTime = audio.currentTime;

        // If we have 30+ seconds buffered ahead, pause loading
        if (bufferedEnd - currentTime > 30) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
      }

      isLoadingSegmentRef.current = true;

      // Fetch segment
      const data = await fetchSegment(trackId, manifest.segments[i]);

      if (!data) {
        // Token might have expired, get new manifest
        const newManifest = await fetchManifest(trackId);
        if (newManifest) {
          manifestRef.current = newManifest;
          // Retry this segment with new token
          const retryData = await fetchSegment(trackId, newManifest.segments[i]);
          if (retryData) {
            await appendBuffer(sourceBuffer, retryData);
            loadedSegmentsRef.current.add(i);
          }
        }
        continue;
      }

      // Append to buffer
      try {
        await appendBuffer(sourceBuffer, data);
        loadedSegmentsRef.current.add(i);
        setLoadingProgress(((i + 1) / manifest.segments.length) * 100);
      } catch (e) {
        console.error("Failed to append segment:", e);
      }

      isLoadingSegmentRef.current = false;

      // Small delay between segments
      await new Promise((r) => setTimeout(r, 10));
    }

    // All segments loaded
    if (loadedSegmentsRef.current.size === manifest.segments.length) {
      if (mediaSourceRef.current?.readyState === "open") {
        try {
          // Wait for any pending updates
          while (sourceBuffer.updating) {
            await new Promise((r) => setTimeout(r, 50));
          }
          mediaSourceRef.current.endOfStream();
        } catch {}
      }
    }
  }, [audioRef, fetchSegment, fetchManifest, appendBuffer]);

  // Initialize and start loading
  const loadTrack = useCallback(async (trackId: string) => {
    cleanup();

    abortControllerRef.current = new AbortController();
    setIsLoading(true);
    setError(null);
    setIsReady(false);
    loadedSegmentsRef.current.clear();

    try {
      // Fetch manifest
      const manifest = await fetchManifest(trackId);
      if (!manifest) {
        throw new Error("Failed to load track");
      }
      manifestRef.current = manifest;

      // Create MediaSource
      const mediaSource = new MediaSource();
      mediaSourceRef.current = mediaSource;

      const objectUrl = URL.createObjectURL(mediaSource);
      objectUrlRef.current = objectUrl;

      // Set audio source
      if (audioRef.current) {
        audioRef.current.src = objectUrl;
      }

      // Wait for MediaSource to open
      await new Promise<void>((resolve, reject) => {
        const onOpen = () => {
          mediaSource.removeEventListener("sourceopen", onOpen);
          mediaSource.removeEventListener("error", onError);
          resolve();
        };
        const onError = () => {
          mediaSource.removeEventListener("sourceopen", onOpen);
          mediaSource.removeEventListener("error", onError);
          reject(new Error("MediaSource failed to open"));
        };
        mediaSource.addEventListener("sourceopen", onOpen);
        mediaSource.addEventListener("error", onError);
      });

      // Create source buffer
      const sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
      sourceBufferRef.current = sourceBuffer;

      // Load first few segments quickly to start playback
      const initialSegments = Math.min(3, manifest.segments.length);

      for (let i = 0; i < initialSegments; i++) {
        const data = await fetchSegment(trackId, manifest.segments[i]);
        if (data) {
          await appendBuffer(sourceBuffer, data);
          loadedSegmentsRef.current.add(i);
          setLoadingProgress(((i + 1) / manifest.segments.length) * 100);
        }
      }

      setIsReady(true);
      setIsLoading(false);

      // Continue loading remaining segments in background
      loadSegments(trackId, manifest, sourceBuffer, initialSegments);

      return true;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return false;
      }
      setError(err instanceof Error ? err.message : "Failed to load");
      setIsLoading(false);
      return false;
    }
  }, [cleanup, fetchManifest, fetchSegment, appendBuffer, loadSegments, audioRef]);

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return {
    loadTrack,
    cleanup,
    isLoading,
    loadingProgress,
    isReady,
    error,
  };
}
