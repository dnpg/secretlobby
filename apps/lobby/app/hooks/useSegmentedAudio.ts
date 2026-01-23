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
  const currentTrackIdRef = useRef<string | null>(null);
  // Priority queue: segments to download in order. Seek reprioritizes this.
  const downloadQueueRef = useRef<number[]>([]);
  const isDownloadingRef = useRef(false);

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
    downloadQueueRef.current = [];
    isDownloadingRef.current = false;
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

  // Append buffer at the correct timeline position
  const appendBuffer = useCallback((sourceBuffer: SourceBuffer, data: ArrayBuffer, byteStart: number): Promise<void> => {
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
        // Set timestampOffset so this segment is placed at the correct position
        sourceBuffer.timestampOffset = byteStart / DEFAULT_BYTES_PER_SEC;
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

  // Process the download queue - downloads segments in priority order
  const processQueue = useCallback(async () => {
    if (isDownloadingRef.current) return;
    isDownloadingRef.current = true;

    const manifest = manifestRef.current;
    const sourceBuffer = sourceBufferRef.current;
    const trackId = currentTrackIdRef.current;

    if (!manifest || !sourceBuffer || !trackId) {
      isDownloadingRef.current = false;
      return;
    }

    while (downloadQueueRef.current.length > 0) {
      if (abortControllerRef.current?.signal.aborted) break;

      // Take the next segment from the front of the queue
      const segmentIndex = downloadQueueRef.current.shift()!;

      // Skip if already loaded
      if (loadedSegmentsRef.current.has(segmentIndex)) continue;
      if (segmentIndex >= manifest.segments.length) continue;

      const segment = manifest.segments[segmentIndex];

      // Wait if buffer is updating
      while (sourceBuffer.updating) {
        await new Promise((r) => setTimeout(r, 50));
      }

      // Fetch the segment
      let data = await fetchSegment(trackId, segment);

      if (!data) {
        // Token might have expired, refresh manifest
        const newManifest = await fetchManifest(trackId);
        if (newManifest) {
          manifestRef.current = newManifest;
          data = await fetchSegment(trackId, newManifest.segments[segmentIndex]);
        }
        if (!data) continue;
      }

      // Append at the correct timeline position
      try {
        await appendBuffer(sourceBuffer, data, segment.start);
        loadedSegmentsRef.current.add(segmentIndex);
        setLoadingProgress((loadedSegmentsRef.current.size / manifest.segments.length) * 100);
      } catch (e) {
        console.error("Failed to append segment:", segmentIndex, e);
      }

      // Small delay between segments to avoid overwhelming the connection
      await new Promise((r) => setTimeout(r, 10));
    }

    // All segments loaded - signal end of stream
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

    isDownloadingRef.current = false;
  }, [fetchSegment, fetchManifest, appendBuffer]);

  // Reprioritize the download queue to load from a specific segment first
  const reprioritizeQueue = useCallback((fromSegmentIndex: number) => {
    const manifest = manifestRef.current;
    if (!manifest) return;

    // Get all segments that still need downloading
    const remaining = new Set<number>();
    for (const idx of downloadQueueRef.current) {
      if (!loadedSegmentsRef.current.has(idx)) {
        remaining.add(idx);
      }
    }

    // Also add any segments not yet in queue and not loaded
    for (let i = 0; i < manifest.segments.length; i++) {
      if (!loadedSegmentsRef.current.has(i)) {
        remaining.add(i);
      }
    }

    if (remaining.size === 0) return;

    // Build new queue: segments from seek point forward, then wrap around
    const newQueue: number[] = [];

    // First: segments from the seek point forward
    for (let i = fromSegmentIndex; i < manifest.segments.length; i++) {
      if (remaining.has(i)) {
        newQueue.push(i);
        remaining.delete(i);
      }
    }

    // Then: any remaining segments before the seek point (in order)
    for (let i = 0; i < fromSegmentIndex; i++) {
      if (remaining.has(i)) {
        newQueue.push(i);
        remaining.delete(i);
      }
    }

    downloadQueueRef.current = newQueue;

    // Restart processing if not already running
    if (!isDownloadingRef.current) {
      processQueue();
    }
  }, [processQueue]);

  // Seek to a specific time
  const seekTo = useCallback(async (time: number) => {
    const audio = audioRef.current;
    const manifest = manifestRef.current;

    if (!audio || !manifest) return;

    // Calculate which segment we need
    const seekByte = timeToByte(time);
    const seekSegmentIndex = getSegmentForByte(seekByte);

    // Reprioritize the download queue to load from seek point
    reprioritizeQueue(seekSegmentIndex);

    // If target segment is already loaded, seek immediately
    if (loadedSegmentsRef.current.has(seekSegmentIndex)) {
      audio.currentTime = time;
    } else {
      // Wait briefly for the segment to load, then seek
      const waitForSegment = async () => {
        let attempts = 0;
        while (!loadedSegmentsRef.current.has(seekSegmentIndex) && attempts < 100) {
          await new Promise((r) => setTimeout(r, 50));
          attempts++;
        }
        if (loadedSegmentsRef.current.has(seekSegmentIndex)) {
          audio.currentTime = time;
        }
      };
      waitForSegment();
    }
  }, [audioRef, timeToByte, getSegmentForByte, reprioritizeQueue]);

  // Initialize and start loading
  const loadTrack = useCallback(async (trackId: string) => {
    cleanup();

    abortControllerRef.current = new AbortController();
    currentTrackIdRef.current = trackId;
    setIsLoading(true);
    setError(null);
    setIsReady(false);
    loadedSegmentsRef.current.clear();
    downloadQueueRef.current = [];

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

      // Create source buffer in 'segments' mode so we can set timestampOffset per segment
      const sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
      sourceBuffer.mode = "segments";
      sourceBufferRef.current = sourceBuffer;

      // Set estimated duration on MediaSource so the browser knows the length
      try {
        mediaSource.duration = estDuration;
      } catch {}

      // Load first few segments quickly to start playback
      const initialSegments = Math.min(3, manifest.segments.length);

      for (let i = 0; i < initialSegments; i++) {
        const segment = manifest.segments[i];
        const data = await fetchSegment(trackId, segment);
        if (data) {
          await appendBuffer(sourceBuffer, data, segment.start);
          loadedSegmentsRef.current.add(i);
          setLoadingProgress(((i + 1) / manifest.segments.length) * 100);
        }
      }

      setIsReady(true);
      setIsLoading(false);

      // Initialize the download queue with remaining segments in order
      for (let i = initialSegments; i < manifest.segments.length; i++) {
        downloadQueueRef.current.push(i);
      }

      // Start processing the queue
      processQueue();

      return true;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return false;
      }
      setError(err instanceof Error ? err.message : "Failed to load");
      setIsLoading(false);
      return false;
    }
  }, [cleanup, fetchManifest, fetchSegment, appendBuffer, processQueue, audioRef]);

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
