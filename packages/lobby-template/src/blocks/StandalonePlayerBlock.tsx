// =============================================================================
// StandalonePlayerBlock
// -----------------------------------------------------------------------------
// Self-contained player block: owns its own `<audio>` element, its own
// `useHlsAudio` instance, and its own `isPlaying` / `activeTrackId` state.
// Used by the live lobby route so that two player blocks on the same page
// stay fully independent — playing track A on block 1 does NOT trigger
// block 2's visualizer animation, because `AudioVisualizer` keys its Web
// Audio routing (`MediaElementAudioSourceNode`) by the `<audio>` DOM node
// and each block now hands the visualizer a different node.
//
// Why a separate component (not a flag on `PlayerBlockView`): the editor
// canvas's `PlayerBlock` already owns its audio internally too, so the
// shared `PlayerBlockView` stays a pure presentation wrapper that takes
// audio from the outside. This component is the published-lobby variant
// that does the wiring the editor's `PlayerBlock` does in the console app
// — keeping the two surfaces visually identical without exposing the
// audio plumbing as a `PlayerBlockView` prop.
//
// Tradeoff: we lose the page-level HLS preload optimization the previous
// shared-audio setup had (one cached MSE buffer warm before the user
// pressed "Enter Lobby"). With multiple independent blocks each with
// different playlists, a single page-level preload no longer maps cleanly
// onto N audio elements — each block now warms its own buffer on mount.
// =============================================================================

import { useEffect, useRef, useState } from "react";
import { PlayerBlockView } from "./PlayerBlockView";
import { useHlsAudio } from "../useHlsAudio";
import type {
  CardStyles,
  ImageUrls,
  TechnicalInfo,
  Track,
} from "../PlayerView";
import type { SocialLinksSettings } from "../SocialLinks";
import type { PlayerBlockContent } from "./types";

export interface StandalonePlayerBlockProps {
  content: PlayerBlockContent;
  tracks: Track[];
  imageUrls: ImageUrls;
  bandName: string | null;
  bandDescription: string | null;
  cardStyles: CardStyles;
  socialLinksSettings: SocialLinksSettings | null;
  technicalInfo: TechnicalInfo | null;
  /** Initial track id (autoplay target) — `null` falls back to the first
   *  track in `tracks`. */
  initialTrackId: string | null;
  csrfToken: string;
  /** Page-level autoplay gate — flipped by the LoginAutoplayToggle on the
   *  login screen. When false, the block respects the user's "don't play
   *  on load" preference regardless of `content.autoplay`. */
  pageAutoplayEnabled?: boolean;
  /** Identifier for this block in the page-level "currently active player"
   *  registry. When `activeBlockId !== blockId`, this block pauses itself —
   *  enforces single-player-at-a-time playback across the page. */
  blockId?: string;
  /** Page-owned "which block is currently playing" state. `null` means
   *  nothing is playing. When a different block becomes active, this block
   *  pauses. */
  activeBlockId?: string | null;
  /** Called with this block's `blockId` when it transitions into playing.
   *  The host wires this to `setActiveBlockId` so sibling blocks pause. */
  onActivate?: (id: string | null) => void;
  /** Notifies the host when the active track changes — drives URL-state /
   *  analytics in the lobby. Optional; defaults to no-op. */
  onTrackChange?: (id: string | null) => void;
  embedded?: boolean;
  apiBaseUrl?: string;
  isDesignerMode?: boolean;
}

export function StandalonePlayerBlock({
  content,
  tracks,
  imageUrls,
  bandName,
  bandDescription,
  cardStyles,
  socialLinksSettings,
  technicalInfo,
  initialTrackId,
  csrfToken,
  pageAutoplayEnabled = true,
  blockId,
  activeBlockId,
  onActivate,
  onTrackChange,
  embedded = true,
  apiBaseUrl,
  isDesignerMode,
}: StandalonePlayerBlockProps) {
  // Per-block audio: each StandalonePlayerBlock instance creates its OWN
  // `<audio>` element + `useHlsAudio` so visualizer routing, playback
  // state, and loading progress are completely independent of any sibling
  // player block on the same page.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsAudio = useHlsAudio(audioRef, { apiBaseUrl });
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(
    initialTrackId
  );
  const loadedTrackRef = useRef<string | null>(null);

  // Resolve which track to load first. `initialTrackId` wins when present
  // and matches a track in this block's slice; otherwise pick the first
  // track in the playlist.
  const initialTrack = initialTrackId
    ? tracks.find((t) => t.id === initialTrackId) ?? tracks[0]
    : tracks[0];

  // Load the initial track exactly once per (track id) so the user can
  // press play without an extra round-trip. Guarded by
  // `loadedTrackRef` so React 18 strict-mode double-effects don't kick
  // off a second HLS load on the same id.
  useEffect(() => {
    const targetId = initialTrack?.id;
    if (!targetId || isDesignerMode) return;
    if (loadedTrackRef.current === targetId) return;
    loadedTrackRef.current = targetId;
    hlsAudio.loadTrack(targetId, undefined, {
      hlsReady: (initialTrack as { hlsReady?: boolean }).hlsReady ?? false,
      duration: initialTrack?.duration ?? null,
      waveformPeaks:
        (initialTrack as { waveformPeaks?: number[] | null }).waveformPeaks ??
        null,
    });
  }, [initialTrack?.id, isDesignerMode]);

  // Auto-play once per mount when the track is ready. Gated on:
  //   - `content.autoplay` (per-block author intent)
  //   - `pageAutoplayEnabled`  (user opt-in via LoginAutoplayToggle)
  //   - not in designer mode    (page-builder canvas never auto-starts)
  // `autoplayTriedRef` ensures we only call `play()` ONCE per mount —
  // otherwise the effect would re-fire every time the user pauses (since
  // it would observe `isPlaying` flipping back to false) and immediately
  // re-start playback, making the pause button feel broken.
  const wantsAutoplay =
    (content.autoplay ?? false) && pageAutoplayEnabled && !isDesignerMode;
  const autoplayTriedRef = useRef(false);
  useEffect(() => {
    if (autoplayTriedRef.current) return;
    if (!wantsAutoplay) return;
    if (!hlsAudio.isReady) return;
    autoplayTriedRef.current = true;
    audioRef.current
      ?.play()
      .then(() => setIsPlaying(true))
      .catch(() => {});
  }, [wantsAutoplay, hlsAudio.isReady]);

  // Cross-block mutual exclusion. Two cases, handled in a SINGLE effect
  // so the closure is internally consistent — splitting them across two
  // effects causes a race where the just-clicked block reads the stale
  // `activeBlockId` from before its own activation lands and pauses
  // itself.
  //
  //   1. Rising edge (`!wasPlayingRef.current && isPlaying`): this block
  //      just started playing → claim the active slot so siblings pause.
  //   2. Lost the slot (`isPlaying && activeBlockId !== blockId`): a
  //      sibling claimed activation while we were playing → pause this
  //      block so only one is audible at a time.
  // The rising-edge claim happens FIRST and short-circuits the lost-slot
  // branch within the same closure, so a block claiming activation does
  // not also pause itself based on the pre-claim value of
  // `activeBlockId`.
  const wasPlayingRef = useRef(false);
  useEffect(() => {
    if (isPlaying && blockId) {
      if (!wasPlayingRef.current) {
        onActivate?.(blockId);
      } else if (activeBlockId && activeBlockId !== blockId) {
        audioRef.current?.pause();
        setIsPlaying(false);
      }
    }
    wasPlayingRef.current = isPlaying;
  }, [isPlaying, activeBlockId, blockId, onActivate]);

  // Bubble track change events out for analytics / URL state. Wrapped so
  // the inner PlayerBlockView's `onTrackChange` always updates this
  // block's local state too.
  const handleTrackChange = (id: string | null) => {
    setActiveTrackId(id);
    onTrackChange?.(id);
  };
  void activeTrackId; // touched to keep the state variable referenced

  return (
    <>
      {/* Hidden audio element — owned by THIS block. `crossOrigin` is set
          so the Web Audio visualizer can read frequency data even when
          the audio is served from a different origin (editor → lobby in
          designer mode; lobby same-origin in production). */}
      <audio
        ref={audioRef}
        preload="none"
        crossOrigin="anonymous"
        style={{ display: "none" }}
        aria-hidden="true"
      />
      <PlayerBlockView
        content={content}
        tracks={tracks}
        audio={{ audioRef, ...hlsAudio }}
        imageUrls={imageUrls}
        bandName={bandName}
        bandDescription={bandDescription}
        cardStyles={cardStyles}
        socialLinksSettings={socialLinksSettings}
        technicalInfo={technicalInfo}
        initialTrackId={initialTrack?.id ?? null}
        csrfToken={csrfToken}
        isPlaying={isPlaying}
        onPlayingChange={setIsPlaying}
        onTrackChange={handleTrackChange}
        embedded={embedded}
        apiBaseUrl={apiBaseUrl}
        isDesignerMode={isDesignerMode}
      />
    </>
  );
}
