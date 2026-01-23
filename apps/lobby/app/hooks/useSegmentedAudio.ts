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

// Estimate bytes per second for MP3 (default 128kbps)
const DEFAULT_BYTES_PER_SEC = 16000;

export function useSegmentedAudio(audioRef: React.RefObject<HTMLAudioElement | null>) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [estimatedDuration, setEstimatedDuration] = useState(0);

  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const manifestRef = useRef<Manifest | null>(null);
  const loadedSegmentsRef = useRef<Set<number>>(new Set());
  const abortControllerRef = useRef<AbortController | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const isLoadingSegmentRef = useRef(false);
  const seekPendingRef = useRef<number | null>(null);
  const currentTrackIdRef = useRef<string | null>(null);

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
    seekPendingRef.current = null;
    currentTrackIdRef.current = null;
    setIsReady(false);
    setLoadingProgress(0);
    setEstimatedDuration(0);
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

  // Calculate which segment index a byte offset falls in
  const getSegmentForByte = useCallback((byteOffset: number): number => {
    const manifest = manifestRef.current;
    if (!manifest) return 0;
    return Math.floor(byteOffset / manifest.segmentSize);
  }, []);

  // Convert time (seconds) to byte offset
  const timeToByte = useCallback((time: number): number => {
    return Math.floor(time * DEFAULT_BYTES_PER_SEC);
  }, []);

  // Load a specific segment by index (for seeking)
  const loadSegmentByIndex = useCallback(async (
    index: number,
    trackId: string,
    manifest: Manifest,
    sourceBuffer: SourceBuffer
  ): Promise<boolean> => {
    if (loadedSegmentsRef.current.has(index)) return true;
    if (index >= manifest.segments.length) return false;

    // Wait if buffer is updating
    while (sourceBuffer.updating) {
      await new Promise((r) => setTimeout(r, 50));
    }

    const data = await fetchSegment(trackId, manifest.segments[index]);
    if (!data) {
      // Token might have expired, refresh manifest
      const newManifest = await fetchManifest(trackId);
      if (newManifest) {
        manifestRef.current = newManifest;
        const retryData = await fetchSegment(trackId, newManifest.segments[index]);
        if (retryData) {
          await appendBuffer(sourceBuffer, retryData);
          loadedSegmentsRef.current.add(index);
          return true;
        }
      }
      return false;
    }

    await appendBuffer(sourceBuffer, data);
    loadedSegmentsRef.current.add(index);
    setLoadingProgress((loadedSegmentsRef.current.size / manifest.segments.length) * 100);
    return true;
  }, [fetchSegment, fetchManifest, appendBuffer]);

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

      // If there's a pending seek, prioritize that segment
      if (seekPendingRef.current !== null) {
        const seekByte = timeToByte(seekPendingRef.current);
        const seekSegment = getSegmentForByte(seekByte);
        seekPendingRef.current = null;

        // Load the seek target segment and its neighbors
        for (let s = Math.max(0, seekSegment - 1); s <= Math.min(seekSegment + 2, manifest.segments.length - 1); s++) {
          if (!loadedSegmentsRef.current.has(s)) {
            await loadSegmentByIndex(s, trackId, manifest, sourceBuffer);
          }
        }

        // Continue from where we left off
        continue;
      }

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
        setLoadingProgress((loadedSegmentsRef.current.size / manifest.segments.length) * 100);
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
          while (sourceBuffer.updating) {
            await new Promise((r) => setTimeout(r, 50));
          }
          mediaSourceRef.current.endOfStream();
        } catch {}
      }
    }
  }, [audioRef, fetchSegment, fetchManifest, appendBuffer, timeToByte, getSegmentForByte, loadSegmentByIndex]);

  // Seek to a specific time
  const seekTo = useCallback(async (time: number) => {
    const audio = audioRef.current;
    const manifest = manifestRef.current;
    const sourceBuffer = sourceBufferRef.current;
    const trackId = currentTrackIdRef.current;

    if (!audio || !manifest || !sourceBuffer || !trackId) return;

    // Calculate which segment we need
    const seekByte = timeToByte(time);
    const seekSegmentIndex = getSegmentForByte(seekByte);

    // Check if the target segment is already loaded
    if (loadedSegmentsRef.current.has(seekSegmentIndex)) {
      // Already buffered, just seek
      audio.currentTime = time;
    } else {
      // Need to load the segment first - signal the loader
      seekPendingRef.current = time;

      // Load the segment and its neighbors immediately
      for (let s = Math.max(0, seekSegmentIndex - 1); s <= Math.min(seekSegmentIndex + 2, manifest.segments.length - 1); s++) {
        if (!loadedSegmentsRef.current.has(s)) {
          await loadSegmentByIndex(s, trackId, manifest, sourceBuffer);
        }
      }

      // Now seek
      audio.currentTime = time;
    }
  }, [audioRef, timeToByte, getSegmentForByte, loadSegmentByIndex]);

  // Initialize and start loading
  const loadTrack = useCallback(async (trackId: string) => {
    cleanup();

    abortControllerRef.current = new AbortController();
    currentTrackIdRef.current = trackId;
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

      // Estimate duration from file size (assuming 128kbps MP3)
      const estDuration = manifest.totalSize / DEFAULT_BYTES_PER_SEC;
      setEstimatedDuration(estDuration);

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

      // Set estimated duration on MediaSource so the browser knows the length
      try {
        mediaSource.duration = estDuration;
      } catch {}

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
    seekTo,
    isLoading,
    loadingProgress,
    isReady,
    error,
    estimatedDuration,
  };
}
