import { useEffect, useRef } from "react";

interface Track {
  id: string;
  hlsReady?: boolean;
}

interface UseTrackPrefetcherOptions {
  tracks: Track[];
  currentTrackId: string | null;
  isPlaying: boolean;
}

/** Number of upcoming tracks to prefetch */
const PREFETCH_AHEAD = 2;

/**
 * Prefetches the next tracks' HLS playlist, init segment, and first audio
 * segment into the browser HTTP cache while the current track plays.
 *
 * When hls.js later requests the same URLs it gets a cache hit, making
 * track transitions near-instant.
 */
export function useTrackPrefetcher({ tracks, currentTrackId, isPlaying }: UseTrackPrefetcherOptions) {
  const prefetchedRef = useRef<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  const prevTracksRef = useRef(tracks);

  // Clear prefetched set when tracks list changes
  useEffect(() => {
    if (prevTracksRef.current !== tracks) {
      prefetchedRef.current.clear();
      prevTracksRef.current = tracks;
    }
  }, [tracks]);

  useEffect(() => {
    if (!currentTrackId || !isPlaying || tracks.length < 2) return;

    const currentIndex = tracks.findIndex((t) => t.id === currentTrackId);
    if (currentIndex === -1) return;

    // Collect up to PREFETCH_AHEAD upcoming HLS-ready tracks that haven't been prefetched
    const toPrefetch: Track[] = [];
    for (let offset = 1; offset <= Math.min(PREFETCH_AHEAD, tracks.length - 1); offset++) {
      const idx = (currentIndex + offset) % tracks.length;
      const track = tracks[idx];
      if (track.hlsReady && !prefetchedRef.current.has(track.id)) {
        toPrefetch.push(track);
      }
    }

    if (toPrefetch.length === 0) return;

    // Cancel any in-flight prefetch
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    const timer = setTimeout(async () => {
      for (const track of toPrefetch) {
        if (signal.aborted) return;
        try {
          await prefetchTrack(track.id, signal);
          prefetchedRef.current.add(track.id);
        } catch {
          // Network errors or aborts — silently ignored
        }
      }
    }, 3000);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [currentTrackId, isPlaying, tracks]);
}

async function prefetchTrack(trackId: string, signal: AbortSignal) {
  // 1. Fetch the playlist
  const playlistRes = await fetch(`/api/hls/${trackId}/playlist`, { signal });
  if (!playlistRes.ok) return;
  const playlistText = await playlistRes.text();

  // 2. Parse init segment URL from #EXT-X-MAP:URI="..."
  const initMatch = playlistText.match(/#EXT-X-MAP:URI="([^"]+)"/);
  const initUrl = initMatch?.[1];

  // 3. Parse first segment URL (first non-comment, non-empty line after an #EXTINF)
  const lines = playlistText.split("\n");
  let firstSegmentUrl: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("#EXTINF:")) {
      const next = lines[i + 1]?.trim();
      if (next && !next.startsWith("#")) {
        firstSegmentUrl = next;
        break;
      }
    }
  }

  // 4. Fetch init + first segment in parallel
  const fetches: Promise<void>[] = [];
  if (initUrl) {
    fetches.push(fetch(initUrl, { signal }).then(() => {}));
  }
  if (firstSegmentUrl) {
    fetches.push(fetch(firstSegmentUrl, { signal }).then(() => {}));
  }
  await Promise.all(fetches);
}
