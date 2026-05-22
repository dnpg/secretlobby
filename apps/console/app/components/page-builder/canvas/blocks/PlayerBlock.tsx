import { useMemo, useRef, useState } from "react";
import {
  buildCardStyles,
  PlayerView,
  useHlsAudio,
  type ImageUrls,
} from "@secretlobby/lobby-template";
import { borderRadiusToCSS, getCardBgCSS } from "~/lib/theme";
import { useSwatches } from "../../PageBuilderRoot";
import { usePageBuilder } from "../../state/provider";
import type {
  PlayerBlockContent,
  PlaylistSummary,
  PlaylistTrackSummary,
  ThemeSettings,
} from "../../state/types";
import { PlayerIcon } from "../../icons";

interface PlayerBlockProps {
  content: PlayerBlockContent;
  theme: ThemeSettings;
}

// Empty image URLs — page builder canvas never renders the lobby's images
// inside an inline player block; those live on Image blocks elsewhere.
const EMPTY_IMAGE_URLS: ImageUrls = {
  background: null,
  backgroundDark: null,
  banner: null,
  bannerDark: null,
  profile: null,
  profileDark: null,
};

function resolvePlaylist(
  playlists: PlaylistSummary[],
  playlistId: string,
  defaultPlaylistId: string
): PlaylistSummary | null {
  if (playlistId) {
    const match = playlists.find((p) => p.id === playlistId);
    if (match) return match;
  }
  // Fallback chain: explicit isDefault → loader-provided defaultId → first.
  const fallback =
    playlists.find((p) => p.isDefault) ??
    playlists.find((p) => p.id === defaultPlaylistId) ??
    playlists[0] ??
    null;
  return fallback;
}

// Player block — Phase 6 wires the real PlayerView from the shared
// player-view package. In `mode === "edit"` we render in designer mode so
// playback handlers don't fire HLS streams while the editor is mounted; in
// `mode === "preview"` we let real playback happen.
export function PlayerBlock({ content, theme }: PlayerBlockProps) {
  const { state } = usePageBuilder();
  const { playlists, defaultPlaylistId, lobbyOrigin, lobbyPreviewToken } = state;
  // Swatch + draft maps drive swatch-ref resolution in `buildCardStyles`
  // (player-region bgs). Without these, a region whose bg is bound to a
  // saved swatch renders as the `SWATCH_REF_FALLBACK` gray.
  const { swatches, drafts } = useSwatches();
  const isPreview = state.mode === "preview";

  const playlist = useMemo(
    () => resolvePlaylist(playlists, content.playlistId, defaultPlaylistId),
    [playlists, content.playlistId, defaultPlaylistId]
  );

  const tracks = useMemo<PlaylistTrackSummary[]>(
    () => playlist?.tracks ?? [],
    [playlist]
  );

  const cardStyles = useMemo(
    () =>
      buildCardStyles(
        theme,
        swatches as Parameters<typeof buildCardStyles>[1],
        drafts as Parameters<typeof buildCardStyles>[2]
      ),
    [theme, swatches, drafts]
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // The page-builder canvas runs on the console origin, but the audio API
  // routes (`/api/hls/...`, `/api/stream-mp3/...`) only exist on the lobby
  // app. We point useHlsAudio at the lobby origin and attach the preview
  // token so the lobby endpoints accept the cross-origin request even when
  // the lobby is still in draft.
  const hlsAudio = useHlsAudio(audioRef, {
    apiBaseUrl: lobbyOrigin,
    previewToken: lobbyPreviewToken,
  });
  // PlayerView's AudioControls interface includes the audioRef itself; the
  // hook only returns the loader/seeker side, so we splice the ref back in.
  const audio = useMemo(() => ({ audioRef, ...hlsAudio }), [hlsAudio]);
  const [isPlaying, setIsPlaying] = useState(false);

  // Empty playlist — surface a friendly placeholder so the designer knows
  // they need to add tracks before this block does anything useful.
  if (!playlist) {
    return (
      <div
        className="w-full p-4 flex items-center gap-3"
        style={{
          background: getCardBgCSS(theme),
          borderRadius: borderRadiusToCSS(theme.cardBorderRadius, 12),
          color: theme.cardHeadingColor,
        }}
      >
        <PlayerIcon className="w-8 h-8" />
        <div>
          <div
            className="text-sm font-medium"
            style={{ color: theme.cardHeadingColor }}
          >
            No playlist selected
          </div>
          <div className="text-xs" style={{ color: theme.cardContentColor }}>
            Pick a playlist in the right panel.
          </div>
        </div>
      </div>
    );
  }

  if (tracks.length === 0) {
    return (
      <div
        className="w-full p-4 flex items-center gap-3"
        style={{
          background: getCardBgCSS(theme),
          borderRadius: borderRadiusToCSS(theme.cardBorderRadius, 12),
          color: theme.cardHeadingColor,
        }}
      >
        <PlayerIcon className="w-8 h-8" />
        <div>
          <div
            className="text-sm font-medium"
            style={{ color: theme.cardHeadingColor }}
          >
            {playlist.name}
          </div>
          <div className="text-xs" style={{ color: theme.cardContentColor }}>
            This playlist has no tracks yet.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Hidden audio element — useHlsAudio attaches MSE/native HLS here.
          `crossOrigin="anonymous"` keeps the audio CORS-clean so the Web
          Audio visualizer can read frequency data from a cross-origin
          source (page-builder canvas pulls audio from the lobby host).
          NOT muted in edit mode — the designer needs to hear playback when
          they click a track in the canvas; that's how the live lobby will
          render it too. */}
      <audio
        ref={audioRef}
        preload="none"
        crossOrigin="anonymous"
      />
      <PlayerView
        tracks={tracks}
        imageUrls={EMPTY_IMAGE_URLS}
        bandName={null}
        bandDescription={null}
        audio={audio}
        isPlaying={isPlaying}
        onPlayingChange={setIsPlaying}
        cardStyles={cardStyles}
        socialLinksSettings={null}
        technicalInfo={null}
        initialTrackId={content.autoplayTrackId ?? null}
        // CSRF token is only used for the Logout form which we hide via
        // designer mode. Empty string is fine here.
        csrfToken=""
        isDesignerMode={!isPreview}
        // Player renders inline as a block in the page-builder canvas (not
        // as a full-viewport page like the public lobby). Skips the
        // fullscreen min-h-screen sizing, the fixed background image and
        // dark overlay, the outer header, and the heavy `container py-8`
        // page padding.
        embedded
        variant={content.variant}
        showVisualizer={content.showVisualizer}
        showPlaylist={content.showPlaylist}
        autoplay={content.autoplay}
        showTrackImage={content.showTrackImage ?? false}
        apiBaseUrl={lobbyOrigin}
      />
    </div>
  );
}
