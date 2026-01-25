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
  duration?: number; // Actual track duration in seconds (from DB)
}

// Estimate bytes per second for MP3 (default 128kbps)
const DEFAULT_BYTES_PER_SEC = 16000;

// Check if MediaSource Extensions is available for audio/mpeg
function canUseMSE(): boolean {
  try {
    return (
      typeof MediaSource !== "undefined" &&
      typeof MediaSource.isTypeSupported === "function" &&
      MediaSource.isTypeSupported("audio/mpeg")
    );
  } catch {
    return false;
  }
}

export function useSegmentedAudio(audioRef: React.RefObject<HTMLAudioElement | null>) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [estimatedDuration, setEstimatedDuration] = useState(0);
  const [isAllSegmentsCached, setIsAllSegmentsCached] = useState(false);
  // Blob mode: time offset of the current blob's first segment relative to track start
  const [blobTimeOffset, setBlobTimeOffset] = useState(0);
  // Whether the current blob includes the track's last segment
  const [blobHasLastSegment, setBlobHasLastSegment] = useState(false);
  const [isBlobMode, setIsBlobMode] = useState(false);
  // Waveform peaks for all segments (for visualizer)
  const [waveformPeaks, setWaveformPeaks] = useState<number[] | null>(null);
  // Peaks per segment stored in a ref, combined into waveformPeaks when updated
  const waveformPeaksPerSegmentRef = useRef<Map<number, number[]>>(new Map());
  // Number of peaks per segment (consistent across all segments)
  const PEAKS_PER_SEGMENT = 64;

  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const manifestRef = useRef<Manifest | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const currentTrackIdRef = useRef<string | null>(null);
  const preloadTokenRef = useRef<string | null>(null);
  const useBlobModeRef = useRef(false);

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
  // Blob mode: which segment the current blob starts from
  const blobStartIndexRef = useRef<number>(0);

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
    preloadTokenRef.current = null;
    setIsReady(false);
    setLoadingProgress(0);
    setEstimatedDuration(0);
    setIsAllSegmentsCached(false);
    setBlobTimeOffset(0);
    setBlobHasLastSegment(false);
    setIsBlobMode(false);
    setWaveformPeaks(null);
    waveformPeaksPerSegmentRef.current.clear();
    blobStartIndexRef.current = 0;
  }, []);

  // Combine all segment peaks into a single array and update state
  const updateCombinedWaveformPeaks = useCallback(() => {
    const manifest = manifestRef.current;
    if (!manifest) return;

    const allPeaks: number[] = [];
    // Combine peaks from all segments in order
    for (let i = 0; i < manifest.segments.length; i++) {
      const segmentPeaks = waveformPeaksPerSegmentRef.current.get(i);
      if (segmentPeaks) {
        allPeaks.push(...segmentPeaks);
      } else {
        // Fill with zeros for missing segments (not yet downloaded)
        for (let j = 0; j < PEAKS_PER_SEGMENT; j++) {
          allPeaks.push(0);
        }
      }
    }
    setWaveformPeaks(allPeaks);
  }, []);

  // Extract waveform peaks from audio data for a segment
  const extractWaveformPeaks = useCallback(async (audioData: ArrayBuffer, segmentIndex: number): Promise<void> => {
    try {
      // Create offline audio context for decoding
      const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(audioData.slice(0));

      // Get the channel data (mono or first channel)
      const channelData = audioBuffer.getChannelData(0);

      // Calculate peaks for this segment
      const samplesPerPeak = Math.floor(channelData.length / PEAKS_PER_SEGMENT);
      const peaks: number[] = [];

      for (let i = 0; i < PEAKS_PER_SEGMENT; i++) {
        let sum = 0;
        const start = i * samplesPerPeak;
        const end = Math.min(start + samplesPerPeak, channelData.length);

        // Calculate RMS for this chunk
        for (let j = start; j < end; j++) {
          sum += channelData[j] * channelData[j];
        }
        const rms = Math.sqrt(sum / (end - start));
        // Normalize to 0-255 range (matching visualizer's data format)
        const normalizedValue = Math.min(255, Math.floor(rms * 255 * 3));
        peaks.push(normalizedValue);
      }

      await audioContext.close();

      // Store peaks for this segment
      waveformPeaksPerSegmentRef.current.set(segmentIndex, peaks);

      // Update combined peaks
      updateCombinedWaveformPeaks();
    } catch (e) {
      console.error("Failed to extract waveform peaks for segment", segmentIndex, e);
    }
  }, [updateCombinedWaveformPeaks]);

  // Fetch manifest
  const fetchManifest = useCallback(async (trackId: string): Promise<Manifest | null> => {
    try {
      const preloadParam = preloadTokenRef.current ? `?preload=${encodeURIComponent(preloadTokenRef.current)}` : "";
      const response = await fetch(`/api/manifest/${trackId}${preloadParam}`, {
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

      const preloadParam = preloadTokenRef.current ? `&preload=${encodeURIComponent(preloadTokenRef.current)}` : "";
      const response = await fetch(
        `/api/segment/${trackId}/${segment.index}?t=${segment.token}${preloadParam}`,
        { signal: controller.signal }
      );

      abortControllerRef.current?.signal.removeEventListener("abort", onMainAbort);

      if (!response.ok) return null;
      return await response.arrayBuffer();
    } catch {
      return null;
    }
  }, []);

  // --- Blob mode helpers (iOS fallback) ---

  // Get the duration of a single segment in seconds
  const getSegmentDuration = useCallback((): number => {
    const manifest = manifestRef.current;
    if (!manifest) return 5; // fallback
    if (manifest.duration && manifest.duration > 0) {
      return manifest.duration / manifest.segments.length;
    }
    // Fallback: estimate from bytes (assumes 128kbps)
    return manifest.segmentSize / DEFAULT_BYTES_PER_SEC;
  }, []);

  // Get the start time (seconds) of a segment
  const getSegmentStartTime = useCallback((index: number): number => {
    return index * getSegmentDuration();
  }, [getSegmentDuration]);

  // Calculate which segment index a time position falls in
  const timeToSegmentIndex = useCallback((time: number): number => {
    const manifest = manifestRef.current;
    if (!manifest) return 0;
    const segDuration = getSegmentDuration();
    const index = Math.floor(time / segDuration);
    return Math.max(0, Math.min(index, manifest.segments.length - 1));
  }, [getSegmentDuration]);

  // Get full track duration (from manifest metadata or estimate)
  const getTrackDuration = useCallback((): number => {
    const manifest = manifestRef.current;
    if (!manifest) return 0;
    if (manifest.duration && manifest.duration > 0) return manifest.duration;
    return manifest.totalSize / DEFAULT_BYTES_PER_SEC;
  }, []);

  // Build a Blob from cached segments starting at startIndex, going forward until a gap
  const buildBlobFromIndex = useCallback((startIndex: number): { blob: Blob; endIndex: number } | null => {
    const manifest = manifestRef.current;
    if (!manifest) return null;

    const parts: ArrayBuffer[] = [];
    let endIndex = startIndex - 1;
    for (let i = startIndex; i < manifest.segments.length; i++) {
      const data = segmentCacheRef.current.get(i);
      if (!data) break; // Stop at first gap
      parts.push(data);
      endIndex = i;
    }
    if (parts.length === 0) return null;
    return { blob: new Blob(parts, { type: "audio/mpeg" }), endIndex };
  }, []);

  // Set the audio element's source to a blob starting from startIndex
  const setBlobSrc = useCallback((startIndex: number, seekTimeInBlob?: number, autoPlay?: boolean) => {
    const audio = audioRef.current;
    if (!audio) return;

    const result = buildBlobFromIndex(startIndex);
    if (!result) return;

    const { blob, endIndex } = result;
    const manifest = manifestRef.current;

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    const url = URL.createObjectURL(blob);
    objectUrlRef.current = url;
    audio.src = url;

    blobStartIndexRef.current = startIndex;
    const offset = getSegmentStartTime(startIndex);
    setBlobTimeOffset(offset);
    setBlobHasLastSegment(manifest ? endIndex >= manifest.segments.length - 1 : false);

    if (seekTimeInBlob !== undefined || autoPlay) {
      const onCanPlay = () => {
        audio.removeEventListener("canplay", onCanPlay);
        if (seekTimeInBlob !== undefined && seekTimeInBlob > 0) {
          audio.currentTime = seekTimeInBlob;
        }
        if (autoPlay) {
          audio.play().catch(() => {});
        }
      };
      audio.addEventListener("canplay", onCanPlay);
    }

    audio.load();
  }, [audioRef, buildBlobFromIndex, getSegmentStartTime]);

  // Process download queue in blob mode — simple background downloader
  const processBlobQueue = useCallback(async () => {
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

      if (segmentCacheRef.current.has(segmentIndex)) continue;
      if (segmentIndex >= manifest.segments.length) continue;

      const segment = manifest.segments[segmentIndex];
      let data = await fetchSegment(trackId, segment);

      if (!data) {
        const newManifest = await fetchManifest(trackId);
        if (newManifest) {
          manifestRef.current = newManifest;
          data = await fetchSegment(trackId, newManifest.segments[segmentIndex]);
        }
        if (!data) continue;
      }

      segmentCacheRef.current.set(segmentIndex, data);
      const totalCached = segmentCacheRef.current.size;
      setLoadingProgress((totalCached / manifest.segments.length) * 100);
      if (totalCached === manifest.segments.length) {
        setIsAllSegmentsCached(true);
      }

      // Extract waveform peaks for visualizer (async, non-blocking)
      extractWaveformPeaks(data, segmentIndex);

      await new Promise((r) => setTimeout(r, 10));
    }

    isDownloadingRef.current = false;
  }, [fetchSegment, fetchManifest, extractWaveformPeaks]);

  // Load track in blob mode (iOS fallback)
  const loadTrackBlob = useCallback(async (trackId: string, preloadToken?: string) => {
    cleanup();

    abortControllerRef.current = new AbortController();
    currentTrackIdRef.current = trackId;
    preloadTokenRef.current = preloadToken || null;
    useBlobModeRef.current = true;
    setIsBlobMode(true);
    setIsLoading(true);
    setError(null);
    setIsReady(false);
    segmentCacheRef.current.clear();
    downloadQueueRef.current = [];

    try {
      const manifest = await fetchManifest(trackId);
      if (!manifest) {
        throw new Error("Failed to load track");
      }
      manifestRef.current = manifest;

      // Use actual duration from DB if available, otherwise estimate
      const trackDuration = manifest.duration && manifest.duration > 0
        ? manifest.duration
        : manifest.totalSize / DEFAULT_BYTES_PER_SEC;
      setEstimatedDuration(trackDuration);

      // Download initial segments (first 2 for faster start)
      const initialSegments = Math.min(2, manifest.segments.length);

      for (let i = 0; i < initialSegments; i++) {
        if (abortControllerRef.current?.signal.aborted) break;
        const segment = manifest.segments[i];
        const data = await fetchSegment(trackId, segment);
        if (data) {
          segmentCacheRef.current.set(i, data);
          setLoadingProgress(((i + 1) / manifest.segments.length) * 100);

          // Extract waveform peaks for visualizer (async, non-blocking)
          extractWaveformPeaks(data, i);
        }
      }

      // Create initial blob starting from segment 0
      setBlobSrc(0);

      setIsReady(true);
      setIsLoading(false);

      // Queue remaining segments for background download
      if (!preloadToken) {
        for (let i = initialSegments; i < manifest.segments.length; i++) {
          downloadQueueRef.current.push(i);
        }
        processBlobQueue();
      }

      return true;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return false;
      }
      setError(err instanceof Error ? err.message : "Failed to load");
      setIsLoading(false);
      return false;
    }
  }, [cleanup, fetchManifest, fetchSegment, setBlobSrc, processBlobQueue, extractWaveformPeaks]);

  // --- MSE mode helpers (desktop) ---

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

  // Process the download queue (MSE mode)
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
      if (totalCached === manifest.segments.length) {
        setIsAllSegmentsCached(true);
      }

      // Extract waveform peaks for visualizer (async, non-blocking)
      extractWaveformPeaks(data, segmentIndex);

      // Try to flush to the source buffer
      await flushAppendQueue();

      // Small delay between downloads
      await new Promise((r) => setTimeout(r, 10));
    }

    isDownloadingRef.current = false;
  }, [fetchSegment, fetchManifest, flushAppendQueue, extractWaveformPeaks]);

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

  // Seek to a specific time
  const seekTo = useCallback(async (time: number) => {
    const audio = audioRef.current;
    const manifest = manifestRef.current;

    if (!audio || !manifest) return;

    // In blob mode: build blob from target segment forward (no need for contiguous from 0)
    if (useBlobModeRef.current) {
      const targetSegment = timeToSegmentIndex(time);
      const segStartTime = getSegmentStartTime(targetSegment);
      const offsetInSegment = time - segStartTime; // How far into the target segment

      // Check if target is within the current blob's range - if so, just seek directly
      const currentBlobStart = blobStartIndexRef.current;
      const currentBlobOffset = getSegmentStartTime(currentBlobStart);

      // Find end of current blob by checking contiguous cached segments from blobStartIndexRef
      let currentBlobEnd = currentBlobStart - 1;
      for (let i = currentBlobStart; i < manifest.segments.length; i++) {
        if (segmentCacheRef.current.has(i)) {
          currentBlobEnd = i;
        } else {
          break;
        }
      }

      // If target is within current blob, just seek directly (instant, no rebuild needed)
      if (targetSegment >= currentBlobStart && targetSegment <= currentBlobEnd) {
        const blobRelativeTime = time - currentBlobOffset;
        audio.currentTime = blobRelativeTime;
        // Resume playback if paused
        if (audio.paused) {
          audio.play().catch(() => {});
        }
        return;
      }

      // Abort any in-progress fetch to reprioritize
      fetchAbortRef.current?.abort();
      isDownloadingRef.current = false;

      // Determine how many contiguous segments we have from target onwards
      let contiguousEnd = targetSegment - 1;
      for (let i = targetSegment; i < manifest.segments.length; i++) {
        if (segmentCacheRef.current.has(i)) {
          contiguousEnd = i;
        } else {
          break;
        }
      }
      const hasEnoughBuffer = contiguousEnd >= targetSegment + 2; // At least 3 segments (~15s)

      if (hasEnoughBuffer) {
        // We have enough cached segments — play immediately
        setBlobSrc(targetSegment, offsetInSegment, true);
        setIsSeeking(false);
      } else {
        // Need to fetch more segments for smooth playback
        audio.pause();
        setIsSeeking(true);

        // Fetch target + next 4 segments in parallel (gives ~25s buffer)
        const segmentsToFetch: number[] = [];
        for (let i = targetSegment; i < Math.min(targetSegment + 5, manifest.segments.length); i++) {
          if (!segmentCacheRef.current.has(i)) {
            segmentsToFetch.push(i);
          }
        }

        // Fetch all needed segments in parallel
        const fetchPromises = segmentsToFetch.map(async (idx) => {
          const segment = manifest.segments[idx];
          const data = await fetchSegment(currentTrackIdRef.current!, segment);
          if (data) {
            segmentCacheRef.current.set(idx, data);
            // Extract waveform peaks for visualizer (async, non-blocking)
            extractWaveformPeaks(data, idx);
          }
          return { idx, success: !!data };
        });

        await Promise.all(fetchPromises);

        const totalCached = segmentCacheRef.current.size;
        setLoadingProgress((totalCached / manifest.segments.length) * 100);
        if (totalCached === manifest.segments.length) {
          setIsAllSegmentsCached(true);
        }

        // Now build blob with all available segments from target
        if (segmentCacheRef.current.has(targetSegment)) {
          setBlobSrc(targetSegment, offsetInSegment, true);
        }
        setIsSeeking(false);
      }

      // Rebuild background download queue: from where we left off, then earlier segments
      const newQueue: number[] = [];
      for (let i = targetSegment; i < manifest.segments.length; i++) {
        if (!segmentCacheRef.current.has(i)) newQueue.push(i);
      }
      for (let i = 0; i < targetSegment; i++) {
        if (!segmentCacheRef.current.has(i)) newQueue.push(i);
      }
      downloadQueueRef.current = newQueue;
      processBlobQueue();
      return;
    }

    // MSE mode: if the time is within the currently buffered range, just seek immediately
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
  }, [audioRef, isTimeBuffered, timeToSegmentIndex, getSegmentStartTime, setBlobSrc, fetchSegment, rebuildBufferFrom, buildQueueFrom, processQueue, processBlobQueue]);

  // Resume downloading remaining segments (after preload-only load)
  const continueDownload = useCallback(() => {
    const manifest = manifestRef.current;
    if (!manifest) return;

    // Clear preload token so subsequent fetches use session auth
    preloadTokenRef.current = null;

    const trackId = currentTrackIdRef.current;
    if (!trackId) return;

    (async () => {
      const newManifest = await fetchManifest(trackId);
      if (newManifest) {
        manifestRef.current = newManifest;
      }

      const m = manifestRef.current!;
      for (let i = 0; i < m.segments.length; i++) {
        if (!segmentCacheRef.current.has(i)) {
          downloadQueueRef.current.push(i);
        }
      }

      if (useBlobModeRef.current) {
        processBlobQueue();
      } else {
        processQueue();
      }
    })();
  }, [fetchManifest, processQueue, processBlobQueue]);

  // Load track in MSE mode (desktop)
  const loadTrackMSE = useCallback(async (trackId: string, preloadToken?: string) => {
    cleanup();

    abortControllerRef.current = new AbortController();
    currentTrackIdRef.current = trackId;
    preloadTokenRef.current = preloadToken || null;
    useBlobModeRef.current = false;
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

      // Use actual duration from DB if available, otherwise estimate from bytes
      const estDuration = manifest.duration && manifest.duration > 0
        ? manifest.duration
        : manifest.totalSize / DEFAULT_BYTES_PER_SEC;
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

          // Extract waveform peaks for visualizer (async, non-blocking)
          extractWaveformPeaks(data, i);
        }
      }

      setIsReady(true);
      setIsLoading(false);

      // If preloading, stop after initial segments to save bandwidth
      if (!preloadToken) {
        // Build download queue for remaining segments
        for (let i = initialSegments; i < manifest.segments.length; i++) {
          downloadQueueRef.current.push(i);
        }

        // Start background downloading
        processQueue();
      }

      return true;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return false;
      }
      setError(err instanceof Error ? err.message : "Failed to load");
      setIsLoading(false);
      return false;
    }
  }, [cleanup, fetchManifest, fetchSegment, appendToSourceBuffer, processQueue, audioRef, extractWaveformPeaks]);

  // Main loadTrack - picks MSE or blob based on browser support
  const loadTrack = useCallback(async (trackId: string, preloadToken?: string) => {
    if (canUseMSE()) {
      return loadTrackMSE(trackId, preloadToken);
    } else {
      return loadTrackBlob(trackId, preloadToken);
    }
  }, [loadTrackMSE, loadTrackBlob]);

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return {
    loadTrack,
    continueDownload,
    cleanup,
    seekTo,
    isLoading,
    isSeeking,
    loadingProgress,
    isReady,
    error,
    estimatedDuration,
    isAllSegmentsCached,
    blobTimeOffset,
    blobHasLastSegment,
    isBlobMode,
    waveformPeaks,
  };
}
