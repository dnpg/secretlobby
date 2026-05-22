import { useEffect, useRef } from "react";

interface Track {
  id: string;
  hlsReady?: boolean;
}

interface UseTrackPrefetcherOptions {
  tracks: Track[];
  currentTrackId: string | null;
  isPlaying: boolean;
  /**
   * Optional absolute origin to prepend to the prefetch fetch URLs. Mirrors
   * the same option on `useHlsAudio` — when omitted, prefetch hits relative
   * URLs (the lobby same-origin case). When set, it points at the lobby
   * origin so the console page-builder can prefetch across origins.
   */
  apiBaseUrl?: string;
  /**
   * Optional preview token to attach to prefetch URLs (for unpublished
   * lobbies being driven from the console).
   */
  previewToken?: string;
}

/** Number of upcoming tracks to prefetch */
const PREFETCH_AHEAD = 2;

/**
 * Prefetches the next tracks' HLS playlist, init segment, and first audio
 * segment into the browser HTTP cache while the current track plays.
 */
export function useTrackPrefetcher({
  tracks,
  currentTrackId,
  isPlaying,
  apiBaseUrl,
  previewToken,
}: UseTrackPrefetcherOptions) {
  const prefetchedRef = useRef<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  const prevTracksRef = useRef(tracks);
  const apiBase = (apiBaseUrl ?? "").replace(/\/+$/, "");
  const previewQuery = previewToken
    ? `?preview=${encodeURIComponent(previewToken)}`
    : "";

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
          await prefetchTrack(track.id, signal, apiBase, previewQuery);
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
  }, [currentTrackId, isPlaying, tracks, apiBase, previewQuery]);
}

async function prefetchTrack(
  trackId: string,
  signal: AbortSignal,
  apiBase: string,
  previewQuery: string
) {
  // Cross-origin prefetch needs credentials to participate in CORS so the
  // browser actually warms the cache for the eventual playback fetch.
  const init: RequestInit = apiBase ? { signal, credentials: "include" } : { signal };
  const playlistRes = await fetch(`${apiBase}/api/hls/${trackId}/playlist${previewQuery}`, init);
  if (!playlistRes.ok) return;
  const playlistText = await playlistRes.text();

  const initMatch = playlistText.match(/#EXT-X-MAP:URI="([^"]+)"/);
  const initUrl = initMatch?.[1];

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

  // The playlist contains relative segment URLs (e.g. `/api/hls/.../segment000.m4s`).
  // When prefetching cross-origin we need to resolve them against the base.
  const resolveUrl = (url: string): string => {
    if (!apiBase) return url;
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    return `${apiBase}${url.startsWith("/") ? url : `/${url}`}`;
  };

  const fetches: Promise<void>[] = [];
  if (initUrl) {
    fetches.push(fetch(resolveUrl(initUrl), init).then(() => {}));
  }
  if (firstSegmentUrl) {
    fetches.push(fetch(resolveUrl(firstSegmentUrl), init).then(() => {}));
  }
  await Promise.all(fetches);
}
