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
  const abortControllerRef = useRef<AbortController | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const currentTrackIdRef = useRef<string | null>(null);

  // Segment cache: persists across seeks so re-appending is instant
  const segmentCacheRef = useRef<Map<number, ArrayBuffer>>(new Map());
  // The index where the current buffer session starts (after a seek-clear)
  const bufferStartIndexRef = useRef<number>(0);
  // Last sequentially appended index in the current buffer session
  const appendedUpToRef = useRef<number>(-1);
  // Download queue and state
  const downloadQueueRef = useRef<number[]>([]);
  const isDownloadingRef = useRef(false);
  const isAppendingRef = useRef(false);
  // Separate abort controller for the current fetch (so we can abort one fetch without killing everything)
  const fetchAbortRef = useRef<AbortController | null>(null);

  // Cleanup function
  const cleanup = useCallback(() => {
    abortControllerRef.current?.abort();
    fetchAbortRef.current?.abort();

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
    segmentCacheRef.current.clear();
    bufferStartIndexRef.current = 0;
    appendedUpToRef.current = -1;
    downloadQueueRef.current = [];
    isDownloadingRef.current = false;
    isAppendingRef.current = false;
    fetchAbortRef.current = null;
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

  // Fetch a single segment (uses fetchAbortRef so it can be cancelled on seek)
  const fetchSegment = useCallback(async (
    trackId: string,
    segment: Segment
  ): Promise<ArrayBuffer | null> => {
    try {
      const controller = new AbortController();
      fetchAbortRef.current = controller;

      // Abort if the main controller is aborted
      const onMainAbort = () => controller.abort();
      abortControllerRef.current?.signal.addEventListener("abort", onMainAbort);

      const response = await fetch(
        `/api/segment/${trackId}/${segment.index}?t=${segment.token}`,
        { signal: controller.signal }
      );

      abortControllerRef.current?.signal.removeEventListener("abort", onMainAbort);

      if (!response.ok) return null;
      return await response.arrayBuffer();
    } catch {
      return null;
    }
  }, []);

  // Append a single buffer to the source buffer (waits for updateend)
  const appendToSourceBuffer = useCallback((sourceBuffer: SourceBuffer, data: ArrayBuffer): Promise<void> => {
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

  // Wait for sourceBuffer to finish updating
  const waitForBuffer = useCallback(async (sourceBuffer: SourceBuffer) => {
    while (sourceBuffer.updating) {
      await new Promise((r) => setTimeout(r, 30));
    }
  }, []);

  // Remove all data from the source buffer
  const clearSourceBuffer = useCallback(async (sourceBuffer: SourceBuffer) => {
    await waitForBuffer(sourceBuffer);

    if (sourceBuffer.buffered.length === 0) return;

    return new Promise<void>((resolve, reject) => {
      const onUpdate = () => {
        sourceBuffer.removeEventListener("updateend", onUpdate);
        sourceBuffer.removeEventListener("error", onError);
        resolve();
      };
      const onError = () => {
        sourceBuffer.removeEventListener("updateend", onUpdate);
        sourceBuffer.removeEventListener("error", onError);
        reject(new Error("Buffer remove error"));
      };

      sourceBuffer.addEventListener("updateend", onUpdate);
      sourceBuffer.addEventListener("error", onError);

      try {
        const end = sourceBuffer.buffered.end(sourceBuffer.buffered.length - 1);
        sourceBuffer.remove(0, end + 1);
      } catch (e) {
        sourceBuffer.removeEventListener("updateend", onUpdate);
        sourceBuffer.removeEventListener("error", onError);
        reject(e);
      }
    });
  }, [waitForBuffer]);

  // Calculate which segment index a time position falls in
  const timeToSegmentIndex = useCallback((time: number): number => {
    const manifest = manifestRef.current;
    if (!manifest) return 0;
    const byteOffset = Math.floor(time * DEFAULT_BYTES_PER_SEC);
    return Math.min(Math.floor(byteOffset / manifest.segmentSize), manifest.segments.length - 1);
  }, []);

  // Calculate the time offset for a segment index
  const segmentIndexToTime = useCallback((index: number): number => {
    const manifest = manifestRef.current;
    if (!manifest) return 0;
    return (index * manifest.segmentSize) / DEFAULT_BYTES_PER_SEC;
  }, []);

  // Check if a time position is within the currently buffered range
  const isTimeBuffered = useCallback((time: number): boolean => {
    const audio = audioRef.current;
    if (!audio) return false;
    for (let i = 0; i < audio.buffered.length; i++) {
      if (time >= audio.buffered.start(i) && time <= audio.buffered.end(i)) {
        return true;
      }
    }
    return false;
  }, [audioRef]);

  // Flush cached segments to the source buffer in sequential order
  const flushAppendQueue = useCallback(async () => {
    if (isAppendingRef.current) return;
    isAppendingRef.current = true;

    const sourceBuffer = sourceBufferRef.current;
    const manifest = manifestRef.current;
    if (!sourceBuffer || !manifest) {
      isAppendingRef.current = false;
      return;
    }

    let nextIndex = appendedUpToRef.current + 1;

    while (nextIndex < manifest.segments.length && segmentCacheRef.current.has(nextIndex)) {
      if (abortControllerRef.current?.signal.aborted) break;

      const data = segmentCacheRef.current.get(nextIndex)!;

      await waitForBuffer(sourceBuffer);

      try {
        await appendToSourceBuffer(sourceBuffer, data);
        appendedUpToRef.current = nextIndex;

        const totalCached = segmentCacheRef.current.size;
        setLoadingProgress((totalCached / manifest.segments.length) * 100);
      } catch (e) {
        console.error("Failed to append segment:", nextIndex, e);
        break;
      }

      nextIndex++;
    }

    // All segments appended - signal end of stream
    if (appendedUpToRef.current === manifest.segments.length - 1) {
      if (mediaSourceRef.current?.readyState === "open") {
        try {
          await waitForBuffer(sourceBuffer);
          mediaSourceRef.current.endOfStream();
        } catch {}
      }
    }

    isAppendingRef.current = false;
  }, [appendToSourceBuffer, waitForBuffer]);

  // Process the download queue
  const processQueue = useCallback(async () => {
    if (isDownloadingRef.current) return;
    isDownloadingRef.current = true;

    const manifest = manifestRef.current;
    const trackId = currentTrackIdRef.current;

    if (!manifest || !trackId) {
      isDownloadingRef.current = false;
      return;
    }

    while (downloadQueueRef.current.length > 0) {
      if (abortControllerRef.current?.signal.aborted) break;

      const segmentIndex = downloadQueueRef.current.shift()!;

      // Skip if already cached
      if (segmentCacheRef.current.has(segmentIndex)) continue;
      if (segmentIndex >= manifest.segments.length) continue;

      const segment = manifest.segments[segmentIndex];

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

      // Cache the downloaded data
      segmentCacheRef.current.set(segmentIndex, data);

      const totalCached = segmentCacheRef.current.size;
      setLoadingProgress((totalCached / manifest.segments.length) * 100);

      // Try to flush to the source buffer
      await flushAppendQueue();

      // Small delay between downloads
      await new Promise((r) => setTimeout(r, 10));
    }

    isDownloadingRef.current = false;
  }, [fetchSegment, fetchManifest, flushAppendQueue]);

  // Build a download queue starting from a given segment index
  const buildQueueFrom = useCallback((fromIndex: number) => {
    const manifest = manifestRef.current;
    if (!manifest) return;

    const newQueue: number[] = [];

    // From seek point forward
    for (let i = fromIndex; i < manifest.segments.length; i++) {
      if (!segmentCacheRef.current.has(i)) newQueue.push(i);
    }
    // Then any earlier segments not yet cached
    for (let i = 0; i < fromIndex; i++) {
      if (!segmentCacheRef.current.has(i)) newQueue.push(i);
    }

    downloadQueueRef.current = newQueue;
  }, []);

  // Rebuild the source buffer from a specific segment index using cached data
  const rebuildBufferFrom = useCallback(async (fromIndex: number) => {
    const sourceBuffer = sourceBufferRef.current;
    const manifest = manifestRef.current;
    if (!sourceBuffer || !manifest) return;

    // Reset appending flag since we're rebuilding
    isAppendingRef.current = false;

    // Abort any in-progress parsing to reset the SourceBuffer's parser state
    await waitForBuffer(sourceBuffer);
    try {
      sourceBuffer.abort();
    } catch {}

    // Clear the source buffer
    try {
      await clearSourceBuffer(sourceBuffer);
    } catch (e) {
      console.error("Failed to clear source buffer:", e);
      return;
    }

    await waitForBuffer(sourceBuffer);

    // Set timestampOffset so audio starts at the correct timeline position
    const timeOffset = segmentIndexToTime(fromIndex);
    sourceBuffer.timestampOffset = timeOffset;

    // Update buffer session tracking
    bufferStartIndexRef.current = fromIndex;
    appendedUpToRef.current = fromIndex - 1;

    // Flush any cached segments from this point forward
    await flushAppendQueue();
  }, [clearSourceBuffer, waitForBuffer, segmentIndexToTime, flushAppendQueue]);

  // Seek to a specific time - instant like YouTube
  const seekTo = useCallback(async (time: number) => {
    const audio = audioRef.current;
    const manifest = manifestRef.current;

    if (!audio || !manifest) return;

    // If the time is within the currently buffered range, just seek immediately
    if (isTimeBuffered(time)) {
      audio.currentTime = time;
      return;
    }

    const seekSegmentIndex = timeToSegmentIndex(time);

    // Abort the current in-flight fetch so we can reprioritize
    fetchAbortRef.current?.abort();

    // Stop the current download loop
    isDownloadingRef.current = false;

    // Rebuild the source buffer from the seek point
    await rebuildBufferFrom(seekSegmentIndex);

    // Build a new download queue prioritizing from seek point
    buildQueueFrom(seekSegmentIndex);

    // Start downloading (non-blocking)
    processQueue();

    // Set currentTime immediately - the audio element will wait/stall
    // until data is buffered at this position (browser handles this gracefully)
    audio.currentTime = time;
  }, [audioRef, isTimeBuffered, timeToSegmentIndex, rebuildBufferFrom, buildQueueFrom, processQueue]);

  // Initialize and start loading
  const loadTrack = useCallback(async (trackId: string) => {
    cleanup();

    abortControllerRef.current = new AbortController();
    currentTrackIdRef.current = trackId;
    setIsLoading(true);
    setError(null);
    setIsReady(false);
    segmentCacheRef.current.clear();
    bufferStartIndexRef.current = 0;
    appendedUpToRef.current = -1;
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

      // Create source buffer (sequence mode for audio/mpeg)
      const sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
      sourceBufferRef.current = sourceBuffer;

      // Set estimated duration
      try {
        mediaSource.duration = estDuration;
      } catch {}

      // Load first few segments to start playback
      const initialSegments = Math.min(3, manifest.segments.length);

      for (let i = 0; i < initialSegments; i++) {
        const segment = manifest.segments[i];
        const data = await fetchSegment(trackId, segment);
        if (data) {
          segmentCacheRef.current.set(i, data);
          await appendToSourceBuffer(sourceBuffer, data);
          appendedUpToRef.current = i;
          setLoadingProgress(((i + 1) / manifest.segments.length) * 100);
        }
      }

      setIsReady(true);
      setIsLoading(false);

      // Build download queue for remaining segments
      for (let i = initialSegments; i < manifest.segments.length; i++) {
        downloadQueueRef.current.push(i);
      }

      // Start background downloading
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
  }, [cleanup, fetchManifest, fetchSegment, appendToSourceBuffer, processQueue, audioRef]);

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
