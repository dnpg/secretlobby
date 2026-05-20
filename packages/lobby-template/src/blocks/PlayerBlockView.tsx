// =============================================================================
// PlayerBlockView
// -----------------------------------------------------------------------------
// Wraps `PlayerView` with the block's persisted configuration (`variant`,
// `showVisualizer`, `showPlaylist`). Runtime data — the track list, audio
// state, image URLs, band info, card styles — comes from the host: the
// lobby's loader resolves these once at the page level and threads them
// through `BlockView`'s `renderPlayer` hook.
//
// Why a separate component (and not inlining the prop-forwarding at the
// callsite): the lobby and the editor both want the same content-driven
// variant logic, and putting it here means a future change to that mapping
// only touches one file. The host still owns the audio hook / track
// resolution because those live in a runtime context this presentation
// package shouldn't reach for (`useHlsAudio` on a hidden `<audio>` element
// that persists across navigations, lobby-loader-fetched playlists, etc.).
//
// `content.playlistId` is currently ignored — the lobby still loads a single
// track list per page. Multi-playlist support is a future migration: once
// the lobby loads multiple playlists, this component picks the right one by
// id and the editor's PlayerBlock follows suit.
// =============================================================================

import {
  PlayerView,
  type AudioControls,
  type CardStyles,
  type ImageUrls,
  type TechnicalInfo,
  type Track,
} from "../PlayerView";
import type { SocialLinksSettings } from "../SocialLinks";
import type { PlayerBlockContent } from "./types";

export interface PlayerBlockViewProps {
  content: PlayerBlockContent;
  /** Track list to play. The lobby's loader resolves this from the lobby's
   *  configured playlist; the editor canvas resolves it from the page-
   *  builder's playlists context. */
  tracks: Track[];
  /** Audio controls — the live `useHlsAudio` return. Owned by the host so
   *  the `<audio>` element persists across navigations and across multiple
   *  player blocks on a future multi-block page. */
  audio: AudioControls;
  imageUrls: ImageUrls;
  bandName: string | null;
  bandDescription: string | null;
  cardStyles: CardStyles;
  socialLinksSettings: SocialLinksSettings | null;
  technicalInfo: TechnicalInfo | null;
  /** Initial track id (autoplay target) — `null` falls back to the first
   *  track in the list. */
  initialTrackId: string | null;
  csrfToken: string;
  isPlaying: boolean;
  onPlayingChange: (next: boolean) => void;
  /** Notifies the host when the active track changes — drives URL-state /
   *  analytics in the lobby and selection sync in the editor canvas. */
  onTrackChange: (id: string | null) => void;
  /** When true (default), PlayerView renders inline — no `min-h-screen`,
   *  no fixed-position background image overlay, no outer `container
   *  mx-auto`. Every page-builder use of PlayerView is inline because the
   *  block lives inside a SectionView column that owns the page chrome.
   *  Set to false only if a host genuinely wants PlayerView to BE the
   *  page (legacy un-section-ised lobby paths). */
  embedded?: boolean;
  /** Forwarded to PlayerView. The editor canvas previews HLS streams
   *  cross-origin against the lobby app; the lobby itself is same-origin
   *  so this is unset there. */
  apiBaseUrl?: string;
  /** Forwarded to PlayerView. When true, PlayerView skips playback wiring
   *  on click events and renders the controls as styling-only — the page-
   *  builder canvas uses this so the designer can click around without
   *  starting HLS streams. Default false. */
  isDesignerMode?: boolean;
}

export function PlayerBlockView({
  content,
  tracks,
  audio,
  imageUrls,
  bandName,
  bandDescription,
  cardStyles,
  socialLinksSettings,
  technicalInfo,
  initialTrackId,
  csrfToken,
  isPlaying,
  onPlayingChange,
  onTrackChange,
  embedded = true,
  apiBaseUrl,
  isDesignerMode,
}: PlayerBlockViewProps) {
  return (
    <PlayerView
      tracks={tracks}
      imageUrls={imageUrls}
      bandName={bandName}
      bandDescription={bandDescription}
      audio={audio}
      isPlaying={isPlaying}
      onPlayingChange={onPlayingChange}
      onTrackChange={onTrackChange}
      cardStyles={cardStyles}
      socialLinksSettings={socialLinksSettings}
      technicalInfo={technicalInfo}
      initialTrackId={initialTrackId}
      csrfToken={csrfToken}
      embedded={embedded}
      apiBaseUrl={apiBaseUrl}
      isDesignerMode={isDesignerMode}
      // Content-driven knobs. The defaults match PlayerView's own defaults
      // so a persisted block with these fields unset still paints the full
      // hero / visualiser / playlist combo. `autoplay` defaults to FALSE
      // so a block author has to explicitly opt in — matches the page-
      // builder UI which exposes autoplay as an off-by-default checkbox.
      variant={content.variant ?? "full"}
      showVisualizer={content.showVisualizer ?? true}
      showPlaylist={content.showPlaylist ?? true}
      autoplay={content.autoplay ?? false}
    />
  );
}
