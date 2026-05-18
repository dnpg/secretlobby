import { useMemo, useRef, useState } from "react";
import {
  PlayerView,
  useHlsAudio,
  type ImageUrls,
  type PlayerRegionStyle,
} from "@secretlobby/lobby-template";
import {
  backdropFilterToCSS,
  borderRadiusToCSS,
  boxPaddingToCSS,
  colorPartToCSS,
  getCardBgCSS,
  getCardBorderCSS,
  normalizeCSSValue,
  type ThemeBackgroundColor,
} from "~/lib/theme";
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

// Build a PlayerRegionStyle from the flat theme fields that drive ONE of
// the four toggleable container regions. `enabled` is the master flag;
// when false, PlayerView ignores every chrome field. The other args
// resolve through their fallback chains so the renderer always has a
// concrete CSS value even when the user hasn't set the optional field
// (the `enabled` toggle then decides whether those values get applied).
function buildRegionStyle(args: {
  enabled: boolean | undefined;
  bg: ThemeBackgroundColor | undefined;
  bgFallback: ThemeBackgroundColor;
  bgIsGradientOverride?: boolean;
  backdropFilter: Parameters<typeof backdropFilterToCSS>[0];
  borderRadius: PlayerRegionStyle["borderRadius"] | undefined;
  borderRadiusFallback: PlayerRegionStyle["borderRadius"];
  borderStyle: PlayerRegionStyle["borderStyle"] | undefined;
  borderWidth: string | undefined;
  borderColor: string | undefined;
  borderColorFallback: string;
  // Swatch + draft maps threaded through so swatch-refs resolve to the
  // designer's saved value instead of `colorPartToCSS`'s gray fallback.
  // `drafts` carries in-progress edits from the swatch editor so the
  // canvas previews unsaved tweaks live.
  swatches: Parameters<typeof colorPartToCSS>[1];
  drafts: Parameters<typeof colorPartToCSS>[2];
}): PlayerRegionStyle {
  const bgPart = args.bg ?? args.bgFallback;
  const bg = colorPartToCSS(bgPart, args.swatches, args.drafts);
  // gradient detection — the helper emits `linear-gradient(...)` etc. for
  // gradient/swatch-resolved-gradient parts. A `solid` part returns a
  // plain hex/rgba. Sniff for any of the known gradient prefixes so the
  // renderer can pick between `background` and `backgroundColor`.
  const bgIsGradient =
    args.bgIsGradientOverride ??
    /(linear|radial|conic)-gradient\(/i.test(bg);
  return {
    enabled: args.enabled ?? false,
    bg,
    bgIsGradient,
    backdropFilter: backdropFilterToCSS(args.backdropFilter),
    borderRadius: args.borderRadius ?? args.borderRadiusFallback,
    borderStyle: args.borderStyle ?? "solid",
    borderWidth: normalizeCSSValue(args.borderWidth, "0"),
    borderColor: args.borderColor ?? args.borderColorFallback,
  };
}

// Map ThemeSettings → CardStyles expected by PlayerView. Mirrors the same
// mapping the lobby app does in `_index.tsx`.
// `swatches` + `drafts` are forwarded through `buildRegionStyle` so swatch
// refs in the per-region backgrounds resolve to the designer's saved
// value (and any in-progress draft edits preview live). Without these the
// page-builder canvas would show `SWATCH_REF_FALLBACK` gray for any
// region whose bg is bound to a saved swatch.
function buildCardStyles(
  theme: ThemeSettings,
  swatches: Parameters<typeof colorPartToCSS>[1],
  drafts: Parameters<typeof colorPartToCSS>[2]
) {
  const bg = getCardBgCSS(theme, swatches, drafts);
  const border = getCardBorderCSS(theme);
  const borderWidth = normalizeCSSValue(theme.cardBorderWidth, "1px");
  return {
    bg,
    bgIsGradient: theme.cardBgType === "gradient",
    borderType: theme.cardBorderShow
      ? theme.cardBorderType === "gradient"
        ? ("gradient" as const)
        : ("solid" as const)
      : ("none" as const),
    borderSolid: border.style,
    borderGradient: border.borderImage ?? "",
    borderWidth,
    headingColor: theme.cardHeadingColor || theme.textPrimary,
    contentColor: theme.cardContentColor || theme.textSecondary,
    mutedColor: theme.cardMutedColor || theme.textMuted,
    visualizerUseCardBg: theme.visualizerUseCardBg ?? false,
    visualizerBorderShow: theme.visualizerBorderShow ?? false,
    visualizerBorderColor: theme.visualizerBorderColor || theme.border,
    visualizerBorderRadius: theme.visualizerBorderRadius ?? 8,
    visualizerBlendMode: theme.visualizerBlendMode || "normal",
    visualizerType: theme.visualizerType || "equalizer",
    cardBorderRadius: theme.cardBorderRadius ?? 12,
    buttonBorderRadius: theme.buttonBorderRadius ?? 24,
    playButtonBorderRadius: theme.playButtonBorderRadius ?? 50,
    // ---- Per-region container chrome (built once per theme update) -----
    playerContainer: buildRegionStyle({
      enabled: theme.playerContainerEnabled,
      bg: theme.playerBg,
      bgFallback: {
        type: "solid",
        color: theme.cardBgColor || "#111827",
        opacity: 100,
      },
      backdropFilter: theme.playerBackdropFilter,
      borderRadius: theme.playerBorderRadius,
      borderRadiusFallback: theme.cardBorderRadius ?? 12,
      borderStyle: theme.playerBorderStyle,
      borderWidth: theme.playerBorderWidth,
      borderColor: theme.playerBorderColor,
      borderColorFallback: theme.cardBorderColor || theme.border,
      swatches,
      drafts,
    }),
    visualizerContainer: buildRegionStyle({
      enabled: theme.visualizerContainerEnabled,
      // Visualizer container bg piggybacks on the legacy flat
      // `visualizerBg` + `visualizerBgOpacity` pair so a designer who's
      // already configured those (or whose persisted lobby theme carries
      // them) doesn't lose them when the toggle is flipped on.
      bg: {
        type: "solid",
        color: theme.visualizerBg || "#111827",
        opacity: theme.visualizerBgOpacity ?? 100,
      },
      bgFallback: { type: "solid", color: "#111827", opacity: 100 },
      backdropFilter: theme.visualizerBackdropFilter,
      borderRadius: theme.visualizerBorderRadius,
      borderRadiusFallback: 8,
      borderStyle: theme.visualizerBorderStyle,
      borderWidth: theme.visualizerBorderWidth,
      borderColor: theme.visualizerBorderColor,
      borderColorFallback: theme.border,
      swatches,
      drafts,
    }),
    transportContainer: buildRegionStyle({
      enabled: theme.transportContainerEnabled,
      bg: theme.transportBg,
      bgFallback: { type: "solid", color: "#000000", opacity: 0 },
      backdropFilter: theme.transportBackdropFilter,
      borderRadius: theme.transportBorderRadius,
      borderRadiusFallback: 8,
      borderStyle: theme.transportBorderStyle,
      borderWidth: theme.transportBorderWidth,
      borderColor: theme.transportBorderColor,
      borderColorFallback: theme.cardBorderColor || theme.border,
      swatches,
      drafts,
    }),
    playlistContainer: buildRegionStyle({
      enabled: theme.playlistContainerEnabled,
      bg: theme.playlistBg,
      bgFallback: { type: "solid", color: "#1f2937", opacity: 0 },
      backdropFilter: theme.playlistBackdropFilter,
      borderRadius: theme.playlistBorderRadius,
      borderRadiusFallback: 8,
      borderStyle: theme.playlistBorderStyle,
      borderWidth: theme.playlistBorderWidth,
      borderColor: theme.playlistBorderColor,
      borderColorFallback: theme.cardBorderColor || theme.border,
      swatches,
      drafts,
    }),

    // ---- Transport content styling -------------------------------------
    // Pre-render the BoxPadding to a CSS shorthand and resolve the
    // play/skip-button backgrounds through colorPartToCSS so the
    // renderer just spreads them onto inline styles. Each color falls
    // through a "use the override → use the legacy parallel field →
    // sensible default" chain so legacy lobbies render unchanged.
    transportPaddingCSS:
      theme.transportPadding !== undefined
        ? boxPaddingToCSS(theme.transportPadding, 0)
        : undefined,
    transportTextColor: theme.transportTextColor,
    progressBarColor: theme.progressBarColor,
    progressBarActiveColor: theme.progressBarActiveColor,
    progressBarTextColor: theme.progressBarTextColor,
    ...(theme.playButtonBg
      ? (() => {
          const css = colorPartToCSS(theme.playButtonBg, swatches, drafts);
          return {
            playButtonBg: css,
            playButtonBgIsGradient: /(linear|radial|conic)-gradient\(/i.test(
              css
            ),
          };
        })()
      : {}),
    playButtonIconColor: theme.playButtonIconColor,
    playButtonBorderWidth: theme.playButtonBorderWidth,
    playButtonBorderColor: theme.playButtonBorderColor,
    playButtonBorderStyle: theme.playButtonBorderStyle,
    ...(theme.skipButtonBg
      ? (() => {
          const css = colorPartToCSS(theme.skipButtonBg, swatches, drafts);
          return {
            skipButtonBg: css,
            skipButtonBgIsGradient: /(linear|radial|conic)-gradient\(/i.test(
              css
            ),
          };
        })()
      : {}),
    skipButtonIconColor: theme.skipButtonIconColor,
    skipButtonBorderRadius: theme.skipButtonBorderRadius,
    skipButtonBorderWidth: theme.skipButtonBorderWidth,
    skipButtonBorderColor: theme.skipButtonBorderColor,
    skipButtonBorderStyle: theme.skipButtonBorderStyle,
  };
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
        initialTrackId={null}
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
        apiBaseUrl={lobbyOrigin}
      />
    </div>
  );
}
