import { useState, useEffect, useCallback, useRef, memo } from "react";
import { ResponsiveImage, PictureImage } from "@secretlobby/ui";
import { createLogger, formatError } from "@secretlobby/logger/client";
import {
  borderRadiusToCSS,
  type BorderRadius,
  type BorderStyle,
} from "@secretlobby/theme";
import { AudioVisualizer } from "./AudioVisualizer";
import { WaveformProgress } from "./WaveformProgress";
import { usePcmAnalyser } from "./usePcmAnalyser";
import { SocialLinks, type SocialLinksSettings } from "./SocialLinks";

const logger = createLogger({ service: "lobby:player" });

/**
 * Single-line title with optional ping-pong marquee.
 *
 * - Idle (`playing=false`) or text fits: truncated with ellipsis on one line.
 * - Playing AND overflowing: animates the text leftward to expose the hidden
 *   tail, pauses, then slides back to the start — and loops. The exact shift
 *   is measured (`scrollWidth - clientWidth`), pushed in as a CSS variable,
 *   and read by the `playerview-marquee-pingpong` keyframes.
 *
 * Overflow detection is a `ResizeObserver` on both the clipping container
 * and the inner text span; the measurement effect re-runs on `text` and
 * `playing` changes (track switches, play/pause).
 *
 * Renders as a `<span>` so this can sit inside heading elements (e.g. an
 * `<h2>` around the now-playing title) without violating heading content
 * rules.
 */
interface TrackTitleProps {
  text: string;
  playing: boolean;
  className?: string;
  style?: React.CSSProperties;
}

function TrackTitle({ text, playing, className, style }: TrackTitleProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);

  useEffect(() => {
    if (!playing) {
      setShift(0);
      return;
    }
    const container = containerRef.current;
    if (!container) return;

    // Measure off the OUTER container — its scrollWidth holds the unclipped
    // natural text width regardless of whether the inner span is plain inline
    // (idle) or inline-block (animating).
    const measure = () => {
      const overflow = container.scrollWidth - container.clientWidth;
      setShift(overflow > 1 ? overflow : 0);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
  }, [text, playing]);

  const animating = playing && shift > 0;
  // Slower for longer shifts so the cadence feels consistent at any width.
  const durationSec = animating ? Math.max(8, shift * 0.04 + 6) : 0;

  return (
    <span
      ref={containerRef}
      className={`block max-w-full overflow-hidden whitespace-nowrap ${
        animating ? "" : "text-ellipsis"
      } ${className ?? ""}`}
      style={style}
    >
      {animating ? (
        // inline-block on the inner span so the marquee transform applies to
        // the whole text block. text-overflow:ellipsis doesn't render against
        // an inline-block child anyway, so we drop it from the parent above
        // while animating.
        <span
          className="inline-block"
          style={{
            animation: `playerview-marquee-pingpong ${durationSec}s ease-in-out infinite`,
            ["--marquee-shift" as unknown as string]: `-${shift}px`,
          } as React.CSSProperties}
        >
          {text}
        </span>
      ) : (
        // Plain inline content so the outer container's text-ellipsis can
        // render the "…" at the clip point.
        text
      )}
    </span>
  );
}

/**
 * Helper function to track events in both Google Analytics (gtag) and Google Tag Manager (dataLayer)
 */
function trackEvent(eventName: string, params: Record<string, any>) {
  if (typeof (window as any).gtag === 'function') {
    (window as any).gtag('event', eventName, params);
  }
  if (Array.isArray((window as any).dataLayer)) {
    (window as any).dataLayer.push({
      event: eventName,
      ...params,
    });
  }
}

export interface Track {
  id: string;
  title: string;
  artist?: string | null;
  filename?: string;
  duration?: number | null;
  hlsReady?: boolean;
  waveformPeaks?: number[] | null;
  /** Owning playlist id — set by the lobby loader so callers (`renderPlayer`)
   *  can filter the page-level tracks list down to the subset a specific
   *  player block should render. Optional because legacy lobbies with no
   *  Playlist row may still pass plain Track shapes. */
  playlistId?: string | null;
  /** Public URL for the track's cover image (mapped from the DB's
   *  `Track.coverMedia` relation by the host loader). Optional — `null` /
   *  undefined means "no cover assigned"; the playlist row renders without a
   *  thumbnail even when the block's `showTrackImage` toggle is on. */
  image?: string | null;
}

export interface ImageUrls {
  background: string | null;
  backgroundDark: string | null;
  banner: string | null;
  bannerDark: string | null;
  profile: string | null;
  profileDark: string | null;
}

export interface AudioControls {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  loadTrack: (trackId: string, preloadToken?: string, options?: { hlsReady?: boolean; duration?: number | null; waveformPeaks?: number[] | null }) => Promise<boolean>;
  isLoading: boolean;
  isSeeking: boolean;
  loadingProgress: number;
  isReady: boolean;
  seekTo: (time: number) => Promise<void>;
  cancelAutoPlay: () => void;
  estimatedDuration: number;
  isAllSegmentsCached: boolean;
  blobTimeOffset: number;
  blobHasLastSegment: boolean;
  isBlobMode: boolean;
  waveformPeaks: number[] | null;
  isSafari: boolean;
  isExtendingBlobRef: React.RefObject<boolean>;
  lastSaneTimeRef: React.RefObject<number>;
}

// Per-region container chrome — bundles the bg / backdrop-filter /
// border / border-radius settings for ONE toggleable region of the
// player (outer player, visualizer banner, transport, playlist).
// `enabled` is the master flag — when false the renderer applies NONE
// of the chrome, leaving the region untouched. `playerRegionStyle`
// below converts an instance into a React CSSProperties object that
// callers can spread onto the region's outer div.
export interface PlayerRegionStyle {
  enabled: boolean;
  /** CSS background-image / -color string (gradient or solid). Optional —
   *  when the user hasn't explicitly configured a bg, this stays undefined
   *  and `playerRegionStyle` skips the `background` / `backgroundColor`
   *  declaration entirely so the region renders with whatever the parent
   *  cascade provides (typically transparent). */
  bg?: string;
  bgIsGradient?: boolean;
  /** Composed `backdrop-filter` value, e.g. `"blur(8px) saturate(140%)"`.
   *  Pass `"none"` (the default) to skip the declaration entirely. */
  backdropFilter: string;
  borderRadius: BorderRadius;
  borderStyle: BorderStyle;
  /** CSS length (e.g. `"1px"`). `"0"` collapses the border entirely. */
  borderWidth: string;
  /** Hex / rgba string. Ignored when borderWidth is `"0"`. */
  borderColor: string;
}

export interface CardStyles {
  bg: string;
  bgIsGradient: boolean;
  borderType: "none" | "solid" | "gradient";
  borderSolid: string;
  borderGradient: string;
  borderWidth: string;
  headingColor: string;
  contentColor: string;
  mutedColor: string;
  visualizerUseCardBg: boolean;
  visualizerBorderShow: boolean;
  visualizerBorderColor: string;
  visualizerBorderRadius: BorderRadius;
  visualizerBlendMode: string;
  visualizerType: "equalizer" | "waveform";
  cardBorderRadius: BorderRadius;
  buttonBorderRadius: BorderRadius;
  playButtonBorderRadius: BorderRadius;
  // ---- Per-region container chrome (all optional, all toggleable). ------
  // Each field is undefined when the consumer hasn't built one for that
  // region. PlayerView reads each with `playerRegionStyle(...)` and only
  // applies the chrome when `enabled === true`.
  playerContainer?: PlayerRegionStyle;
  visualizerContainer?: PlayerRegionStyle;
  transportContainer?: PlayerRegionStyle;
  playlistContainer?: PlayerRegionStyle;

  // ---- Transport content styling (inside the transport container) -------
  // These apply independently of `transportContainer.enabled`: a designer
  // can recolour the controls / progress bar / text even when the
  // container chrome stays invisible. All optional — consumers should
  // read with sensible fallbacks (legacy `headingColor`, accent, etc.).

  /** Pre-rendered CSS padding shorthand for the transport wrapper, e.g.
   *  `"16px"` or `"8px 16px 16px 8px"`. PlayerBlock computes this from
   *  the flat `transportPadding` field via `boxPaddingToCSS`. */
  transportPaddingCSS?: string;
  transportTextColor?: string;

  progressBarColor?: string;
  progressBarActiveColor?: string;
  progressBarTextColor?: string;

  /** Pre-resolved CSS background string for the play button (handles
   *  solid + gradient + swatch-ref via `colorPartToCSS`). */
  playButtonBg?: string;
  playButtonBgIsGradient?: boolean;
  playButtonIconColor?: string;
  playButtonBorderWidth?: string;
  playButtonBorderColor?: string;
  playButtonBorderStyle?: BorderStyle;

  skipButtonBg?: string;
  skipButtonBgIsGradient?: boolean;
  skipButtonIconColor?: string;
  skipButtonBorderRadius?: BorderRadius;
  skipButtonBorderWidth?: string;
  skipButtonBorderColor?: string;
  skipButtonBorderStyle?: BorderStyle;

  // ---- Playlist track rows ----------------------------------------------
  // Three visual states (normal / hover / active-i.e.-current-track), each
  // with its own bg + title text + number text + time text. `trackMutedText`
  // paints the artist line in every state. All optional: when unset, the
  // playlist render falls back to the legacy `contentColor` / `mutedColor` /
  // accent-mix behaviour so existing themes look identical.
  //
  // `track*BgIsGradient` is the gradient flag that mirrors `bgIsGradient`
  // on PlayerRegionStyle: when true, PlayerView writes the CSS string to
  // `background:` (so a `linear-gradient(...)` parses), otherwise to
  // `backgroundColor:` (so single-color fills don't bypass React's style
  // diffing).
  trackBg?: string;
  trackBgIsGradient?: boolean;
  trackText?: string;
  trackMutedText?: string;
  trackNumberText?: string;
  trackTimeText?: string;
  trackHoverBg?: string;
  trackHoverBgIsGradient?: boolean;
  trackHoverText?: string;
  trackHoverNumberText?: string;
  trackHoverTimeText?: string;
  trackActiveBg?: string;
  trackActiveBgIsGradient?: boolean;
  trackActiveText?: string;
  trackActiveNumberText?: string;
  trackActiveTimeText?: string;

  // ---- Playlist chrome ---------------------------------------------------
  /** CSS length for the vertical gap between playlist track rows
   *  (e.g. `"8px"`). Default is `"0"`. */
  playlistGap?: string;
  /** Color of the "Playlist" title above the track list. Falls back to
   *  `headingColor` at the render site when undefined. */
  playlistTitleColor?: string;
}

// Translate a PlayerRegionStyle into inline CSS. Returns an empty object
// when the region is disabled or undefined, so callers can spread the
// result unconditionally:
//
//   <div style={{ ...someBaseStyle, ...playerRegionStyle(r) }}>
//
// The bg path picks between `background` (gradient string) and
// `backgroundColor` (solid) so single-color fills don't accidentally
// short-circuit React's style diffing. Both `backdropFilter` and the
// `-webkit-` prefix are written because Safari still requires the
// prefixed form.
export function playerRegionStyle(
  region: PlayerRegionStyle | undefined
): React.CSSProperties {
  if (!region || !region.enabled) return {};
  const borderEnabled =
    region.borderStyle !== "none" &&
    region.borderWidth !== "0" &&
    region.borderWidth.trim() !== "";
  const bdf = region.backdropFilter;
  const applyBdf = bdf && bdf !== "none" && bdf.trim().length > 0;
  // bg is opt-in — only emit a background declaration when the theme has
  // an explicit value. A missing bg leaves the region's background to the
  // parent cascade (usually transparent), so enabling the container just
  // to get a border/radius doesn't drag in a default fill.
  const bgStyle =
    region.bg !== undefined && region.bg !== ""
      ? region.bgIsGradient
        ? { background: region.bg }
        : { backgroundColor: region.bg }
      : {};
  return {
    ...bgStyle,
    ...(applyBdf
      ? { backdropFilter: bdf, WebkitBackdropFilter: bdf }
      : {}),
    borderRadius: borderRadiusToCSS(region.borderRadius, 0),
    ...(borderEnabled
      ? {
          borderWidth: region.borderWidth,
          borderColor: region.borderColor,
          borderStyle: region.borderStyle,
        }
      : { border: "none" }),
  };
}

// Inline-style builder for the Play (toggle play / pause) button. Every
// CSS property is conditional on the matching `cardStyles.*` field being
// set — there are NO hardcoded fallbacks here. If the designer hasn't
// configured a property, the button renders without that declaration
// (background defaults to none, color inherits via currentColor, no
// border, no radius, etc.). Default values live in the theme settings
// layer; the renderer just paints whatever the theme has.
//
// Each border property is applied independently so changing only one
// (e.g. switching style from "solid" to "dashed") takes effect on its
// own. CSS itself decides whether a border actually paints — a style
// without a width gets the browser's `medium` width default, a width
// without a style gets `border-style: none` and no border. That matches
// the semantics of the corresponding HTML border-style spec.
// Build the inline `border` declaration set. When the user picks
// `borderStyle: "none"` (or `borderWidth: "0"`), Tailwind v4's preflight
// still leaves `border-style: solid; border-width: 0` on every element —
// skipping the declarations here silently inherits that, and any non-zero
// width (e.g. a leftover "1px" from a prior choice) paints a solid border
// despite the user's intent. So when the user opted out of a border we
// emit `border: "none"` explicitly to wipe any inherited / preflight
// declaration; only when the user opted IN (style !== none AND width !==
// "0") do we set the per-axis declarations.
function buttonBorderStyle(args: {
  borderWidth: string | undefined;
  borderStyle: BorderStyle | undefined;
  borderColor: string | undefined;
}): React.CSSProperties {
  const hasBorder =
    args.borderStyle !== undefined &&
    args.borderStyle !== "none" &&
    args.borderWidth !== undefined &&
    args.borderWidth !== "0" &&
    args.borderWidth.trim() !== "";
  if (!hasBorder) {
    return { border: "none" };
  }
  return {
    borderStyle: args.borderStyle,
    borderWidth: args.borderWidth,
    ...(args.borderColor ? { borderColor: args.borderColor } : {}),
  };
}

function playButtonStyle(cardStyles?: CardStyles): React.CSSProperties {
  return {
    ...(cardStyles?.playButtonBorderRadius !== undefined
      ? {
          borderRadius: borderRadiusToCSS(
            cardStyles.playButtonBorderRadius,
            0
          ),
        }
      : {}),
    ...(cardStyles?.playButtonBg
      ? cardStyles.playButtonBgIsGradient
        ? { background: cardStyles.playButtonBg }
        : { backgroundColor: cardStyles.playButtonBg }
      : {}),
    ...(cardStyles?.playButtonIconColor
      ? { color: cardStyles.playButtonIconColor }
      : {}),
    ...buttonBorderStyle({
      borderWidth: cardStyles?.playButtonBorderWidth,
      borderStyle: cardStyles?.playButtonBorderStyle,
      borderColor: cardStyles?.playButtonBorderColor,
    }),
  };
}

// Same shape as `playButtonStyle` but bound to the `skipButton*` theme
// fields. Used for both the Previous-track and Next-track buttons —
// they share the same theme settings group and render identically apart
// from their icon glyph.
function skipButtonStyle(cardStyles?: CardStyles): React.CSSProperties {
  return {
    ...(cardStyles?.skipButtonBorderRadius !== undefined
      ? {
          borderRadius: borderRadiusToCSS(
            cardStyles.skipButtonBorderRadius,
            0
          ),
        }
      : {}),
    ...(cardStyles?.skipButtonBg
      ? cardStyles.skipButtonBgIsGradient
        ? { background: cardStyles.skipButtonBg }
        : { backgroundColor: cardStyles.skipButtonBg }
      : {}),
    ...(cardStyles?.skipButtonIconColor
      ? { color: cardStyles.skipButtonIconColor }
      : {}),
    ...buttonBorderStyle({
      borderWidth: cardStyles?.skipButtonBorderWidth,
      borderStyle: cardStyles?.skipButtonBorderStyle,
      borderColor: cardStyles?.skipButtonBorderColor,
    }),
  };
}

interface CardContainerProps {
  cardStyles?: CardStyles;
  children: React.ReactNode;
  className?: string;
  /** When provided AND `regionOverride.enabled === true`, CardContainer
   *  skips its own bg/border code path and renders a plain `<div>` with
   *  the region's chrome. Lets the player's new per-region settings own
   *  the wrapper styling without stacking on top of CardContainer's
   *  legacy card chrome. When the region is disabled or unset, falls
   *  through to the legacy CardContainer behaviour. */
  regionOverride?: PlayerRegionStyle;
}

function CardContainer({
  cardStyles,
  children,
  className,
  regionOverride,
}: CardContainerProps) {
  // Region override short-circuit — the player's new toggleable chrome
  // wins. CardContainer's gradient-border / solid-border branches below
  // would otherwise paint stacking surfaces on top of the region's bg.
  if (regionOverride?.enabled) {
    return (
      <div className={className} style={playerRegionStyle(regionOverride)}>
        {children}
      </div>
    );
  }
  // Route the BorderRadius (number or per-corner object) through the helper so
  // both uniform and per-corner cases render correctly. The gradient-border
  // branch needs an outer radius and an inset inner radius; for the per-corner
  // case we apply the same CSS string to both (the visible inner offset comes
  // from the wrapper padding, not from radius math).
  const radiusCSS = borderRadiusToCSS(cardStyles?.cardBorderRadius, 12);
  const borderWidth = cardStyles?.borderWidth || "1px";

  const contentBg = cardStyles?.bgIsGradient
    ? { background: cardStyles.bg }
    : { backgroundColor: cardStyles?.bg || "color-mix(in srgb, var(--color-bg-secondary) 50%, transparent)" };

  // PlayerView's CardContainer doesn't currently know about the page-builder
  // backdrop-filter theme field — that's a per-block override on the canvas
  // CardBlock. If/when the lobby app starts rendering pageLayout, we'd thread
  // a `backdropFilter` string through `cardStyles` here and apply it inline.
  // Until then, no backdrop-filter is applied at this layer.

  if (cardStyles?.borderType === "gradient") {
    // For a uniform numeric radius, keep the previous calc-based inner radius
    // so the inner shape hugs the outer ring tightly. For per-corner mode we
    // fall back to applying the same shorthand to the inner shape — the
    // visible padding still produces a visible gradient ring.
    const isUniform = typeof cardStyles.cardBorderRadius === "number";
    const innerRadius = isUniform
      ? `calc(${cardStyles.cardBorderRadius as number}px - ${borderWidth})`
      : radiusCSS;
    return (
      <div
        className="max-w-full overflow-hidden"
        style={{
          borderRadius: radiusCSS,
          background: cardStyles.borderGradient,
          padding: borderWidth,
        }}
      >
        <div
          className={className}
          style={{
            borderRadius: innerRadius,
            ...contentBg,
          }}
        >
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`max-w-full ${className ?? ""}`}
      style={{
        borderRadius: radiusCSS,
        ...contentBg,
        border: cardStyles?.borderType === "solid" ? cardStyles.borderSolid : "none",
      }}
    >
      {children}
    </div>
  );
}

interface SidebarProps {
  imageUrls: ImageUrls;
  bandName?: string | null;
  bandDescription?: string | null;
  cardStyles?: CardStyles;
  socialLinksSettings?: SocialLinksSettings | null;
}

const Sidebar = memo(function Sidebar({ imageUrls, bandName, bandDescription, cardStyles, socialLinksSettings }: SidebarProps) {
  const [profileError, setProfileError] = useState(false);
  const showProfile = !!imageUrls.profile && !profileError;

  const hasSocialContent = socialLinksSettings &&
    (socialLinksSettings.links.length > 0 || socialLinksSettings.title || socialLinksSettings.contentBefore || socialLinksSettings.contentAfter);

  const showSocialAbove = hasSocialContent && socialLinksSettings?.placement === "sidebar-above";
  const showSocialBelow = hasSocialContent && (socialLinksSettings?.placement === "sidebar-below" || !socialLinksSettings?.placement);

  const SocialCard = () => (
    <CardContainer cardStyles={cardStyles} className="backdrop-blur p-4">
      <SocialLinks
        settings={socialLinksSettings!}
        headingColor={cardStyles?.headingColor}
        contentColor={cardStyles?.contentColor}
      />
    </CardContainer>
  );

  return (
    <div className="space-y-6">
      {showProfile && (
        <div className="flex justify-center overflow-hidden border-2" style={{ borderRadius: borderRadiusToCSS(cardStyles?.cardBorderRadius, 12), borderColor: "var(--color-border)" }}>
          {imageUrls.profileDark ? (
            <PictureImage
              sources={[
                { media: "(prefers-color-scheme: dark)", src: imageUrls.profileDark, widths: [300, 600] },
              ]}
              fallback={{ src: imageUrls.profile!, widths: [300, 600] }}
              alt={bandName || "Profile"}
              className="w-full object-cover"
              onError={() => setProfileError(true)}
            />
          ) : (
            <ResponsiveImage
              src={imageUrls.profile!}
              alt={bandName || "Profile"}
              widths={[300, 600]}
              className="w-full object-cover"
              onError={() => setProfileError(true)}
            />
          )}
        </div>
      )}

      {showSocialAbove && <SocialCard />}

      {(bandName || bandDescription) && (
        <CardContainer cardStyles={cardStyles} className="backdrop-blur p-4">
          {bandName && (
            <h3 className="text-lg font-semibold mb-2" style={{ color: cardStyles?.headingColor }}>
              {bandName}
            </h3>
          )}
          {bandDescription && (
            <div
              className="text-sm prose-content"
              style={{ color: cardStyles?.contentColor }}
              dangerouslySetInnerHTML={{ __html: bandDescription }}
            />
          )}
        </CardContainer>
      )}

      {showSocialBelow && <SocialCard />}
    </div>
  );
});

export interface TechnicalInfo {
  title: string;
  content: string;
}

interface PlayerViewProps {
  tracks: Track[];
  imageUrls: ImageUrls;
  bandName?: string | null;
  bandDescription?: string | null;
  audio: AudioControls;
  isPlaying: boolean;
  onPlayingChange: (playing: boolean) => void;
  onTrackChange?: (trackId: string) => void;
  cardStyles?: CardStyles;
  socialLinksSettings?: SocialLinksSettings | null;
  technicalInfo?: TechnicalInfo | null;
  initialTrackId?: string | null;
  csrfToken: string;
  isDesignerMode?: boolean;
  /**
   * When true, the player renders as an inline block (no full-viewport
   * sizing, no fullscreen fixed background/overlay, no outer page padding).
   * This is the mode used by the page-builder canvas where the player is
   * one of many blocks on a page rather than the entire page.
   */
  embedded?: boolean;
  /**
   * Optional absolute origin (e.g. `https://acme.secretlobby.co`) that
   * cross-origin audio API requests should target. The consumer (e.g. the
   * console page-builder) sets this so that audio fetches from
   * `useHlsAudio` and friends hit the lobby host instead of the host the
   * player is rendered on. Lobby callers leave this `undefined` and keep
   * the same-origin behavior.
   */
  apiBaseUrl?: string;
  /**
   * Layout variant. `"full"` (default) renders the full hero + playlist
   * layout. `"compact"` renders a vertically stacked card with a 96px
   * visualizer banner. `"minimal"` renders a dense three-row "wave strip"
   * (controls · title + mini-viz · progress · horizontal track chips).
   * All three variants honour `showVisualizer`, `showPlaylist`, and
   * `autoplay`.
   */
  variant?: "full" | "compact" | "minimal";
  /** When false the visualizer / mini-visualizer is omitted. Defaults true. */
  showVisualizer?: boolean;
  /** When false the playlist (or compact-variant track strip) is omitted.
   *  Defaults true. The current-track header / controls / progress always
   *  render so a single-track player still works with the list hidden. */
  showPlaylist?: boolean;
  /** Auto-play the initial track on mount. Skipped while `isDesignerMode`
   *  is true so the page-builder canvas doesn't blast audio while the user
   *  is editing. Browser autoplay policies may still block the call when
   *  there's no prior user gesture — the rejection is caught silently. */
  autoplay?: boolean;
  /** When true, each playlist row renders a small thumbnail of the track's
   *  `image` URL immediately before its title. Off by default so existing
   *  lobbies render identically. Tracks without an `image` still render
   *  without a thumb — we never reserve dead space for a missing cover. */
  showTrackImage?: boolean;
}

export function PlayerView({
  tracks,
  imageUrls,
  bandName,
  bandDescription,
  audio,
  isPlaying,
  onPlayingChange,
  onTrackChange,
  cardStyles,
  socialLinksSettings,
  technicalInfo,
  initialTrackId,
  csrfToken,
  isDesignerMode = false,
  embedded = false,
  apiBaseUrl: _apiBaseUrl,
  variant = "full",
  showVisualizer = true,
  showPlaylist = true,
  autoplay = false,
  showTrackImage = false,
}: PlayerViewProps) {
  // apiBaseUrl is plumbed through props for API symmetry but is consumed by
  // the caller via `useHlsAudio` directly — PlayerView never sets `<audio
  // src>` itself, so there's nothing for it to do with the value here. We
  // accept it so consumers can flow it through a single prop boundary.
  void _apiBaseUrl;
  const { audioRef, loadTrack: loadSegmentedTrack, isLoading, isSeeking, loadingProgress, isReady, seekTo, cancelAutoPlay, estimatedDuration } = audio;
  void isSeeking;

  const getInitialTrack = () => {
    if (initialTrackId) {
      const found = tracks.find((t) => t.id === initialTrackId);
      if (found) return found;
    }
    return tracks[0] || null;
  };

  const [currentTrack, setCurrentTrack] = useState<Track | null>(getInitialTrack);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [hoverPercent, setHoverPercent] = useState<number | null>(null);
  const [hoveredTrackId, setHoveredTrackId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPercent, setDragPercent] = useState(0);
  const [seekLoading, setSeekLoading] = useState(false);
  const seekLoadingRef = useRef(false);
  const isDraggingRef = useRef(false);
  const dragPercentRef = useRef(0);
  const trackDurationRef = useRef(0);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const progressMilestonesRef = useRef<Set<number>>(new Set());
  const currentTrackIdRef = useRef<string | null>(null);
  const technicalInfoRef = useRef<HTMLDivElement>(null);

  const mouseMoveHandlerRef = useRef<((e: MouseEvent) => void) | null>(null);
  const mouseUpHandlerRef = useRef<(() => void) | null>(null);

  const isSafari = typeof navigator !== "undefined"
    && /Safari/.test(navigator.userAgent)
    && !/Chrome/.test(navigator.userAgent);

  const currentTrackHlsReady = currentTrack?.hlsReady ?? false;
  const pcmEnabled = isSafari && !currentTrackHlsReady && (cardStyles?.visualizerType ?? "equalizer") === "equalizer";
  const pcmAnalyser = usePcmAnalyser({
    enabled: pcmEnabled,
    trackId: currentTrack?.id ?? null,
    audioElement,
  });

  const effectiveVisualizerType = (isSafari && currentTrackHlsReady && (cardStyles?.visualizerType ?? "equalizer") === "equalizer")
    ? "waveform"
    : (cardStyles?.visualizerType ?? "equalizer");

  useEffect(() => {
    if (audioRef.current) {
      setAudioElement(audioRef.current);
    }
  }, [isReady, audioRef]);

  useEffect(() => {
    return () => {
      if (mouseMoveHandlerRef.current) {
        document.removeEventListener("mousemove", mouseMoveHandlerRef.current);
      }
      if (mouseUpHandlerRef.current) {
        document.removeEventListener("mouseup", mouseUpHandlerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleLinkClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a');
      if (link && link.href) {
        trackEvent('wysiwyg_link_click', {
          event_category: 'content',
          event_label: link.textContent || 'Unknown',
          url: link.href,
          section: 'technical_info',
        });
      }
    };

    const techInfoEl = technicalInfoRef.current;
    if (techInfoEl) {
      techInfoEl.addEventListener('click', handleLinkClick);
    }

    return () => {
      if (techInfoEl) {
        techInfoEl.removeEventListener('click', handleLinkClick);
      }
    };
  }, [technicalInfo?.content]);

  useEffect(() => {
    if (currentTrack) {
      onTrackChange?.(currentTrack.id);

      if (currentTrackIdRef.current !== currentTrack.id) {
        progressMilestonesRef.current.clear();
        currentTrackIdRef.current = currentTrack.id;
      }
    }
  }, [currentTrack?.id]);

  useEffect(() => {
    if (estimatedDuration > 0 && !isFinite(duration)) {
      setDuration(estimatedDuration);
    }
    if (estimatedDuration > 0) {
      trackDurationRef.current = estimatedDuration;
    }
  }, [estimatedDuration]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const totalDuration = estimatedDuration || 0;

    const updateProgress = () => {
      if (totalDuration > 0 && !isDraggingRef.current && !seekLoadingRef.current) {
        const realTime = audio.currentTime;
        const progressPercent = (realTime / totalDuration) * 100;
        setCurrentTime(realTime);
        setProgress(progressPercent);

        const milestones = [25, 50, 75, 100];
        for (const milestone of milestones) {
          if (progressPercent >= milestone && !progressMilestonesRef.current.has(milestone)) {
            progressMilestonesRef.current.add(milestone);
            trackEvent('audio_progress', {
              event_category: 'audio',
              event_label: currentTrack?.title || 'Unknown',
              track_id: currentTrack?.id,
              track_artist: currentTrack?.artist,
              progress_percent: milestone,
            });
          }
        }
      }
    };

    const handleLoadedMetadata = () => {
      if (totalDuration > 0) {
        setDuration(totalDuration);
      }
    };

    const handleEnded = () => {
      if (seekLoadingRef.current) return;

      trackEvent('audio_complete', {
        event_category: 'audio',
        event_label: currentTrack?.title || 'Unknown',
        track_id: currentTrack?.id,
        track_artist: currentTrack?.artist,
      });

      onPlayingChange(false);
      playNext();
    };

    const handlePlaying = () => {
      if (seekLoadingRef.current) {
        seekLoadingRef.current = false;
        setSeekLoading(false);
      }
    };

    const handleSeeked = () => {
      if (seekLoadingRef.current) {
        seekLoadingRef.current = false;
        setSeekLoading(false);
      }
    };

    const handlePlay = () => {
      onPlayingChange(true);

      trackEvent('audio_play', {
        event_category: 'audio',
        event_label: currentTrack?.title || 'Unknown',
        track_id: currentTrack?.id,
        track_artist: currentTrack?.artist,
      });
    };

    const handlePause = () => {
      if (!seekLoadingRef.current) {
        onPlayingChange(false);

        trackEvent('audio_pause', {
          event_category: 'audio',
          event_label: currentTrack?.title || 'Unknown',
          track_id: currentTrack?.id,
          track_artist: currentTrack?.artist,
          current_time: audio.currentTime,
        });
      }
    };

    audio.addEventListener("timeupdate", updateProgress);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("playing", handlePlaying);
    audio.addEventListener("seeked", handleSeeked);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);

    return () => {
      audio.removeEventListener("timeupdate", updateProgress);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("seeked", handleSeeked);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
    };
  }, [estimatedDuration, audioRef, seekTo, onPlayingChange]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || seekLoadingRef.current) return;

    if (!audio.paused) {
      audio.pause();
      cancelAutoPlay();

      trackEvent('player_control_click', {
        event_category: 'player',
        event_label: 'pause_button',
        control: 'pause',
      });
    } else {
      // If the <audio> element has no source attached yet (canvas-mode mount
      // without a parent-driven initial loadTrack), kick off a full load via
      // `playTrack`. This mirrors the rescue path in the playlist row click
      // handler and keeps the big play button working without requiring the
      // host to pre-load the initial track. On the lobby route, `currentSrc`
      // is always populated by the mount-time loadTrack effect, so this
      // branch never fires there.
      if (!audio.currentSrc && currentTrack) {
        playTrack(currentTrack);
      } else {
        audio.play().catch(() => {});
      }

      trackEvent('player_control_click', {
        event_category: 'player',
        event_label: 'play_button',
        control: 'play',
      });
    }
    // `playTrack` and `currentTrack` are intentionally read from closure so
    // we don't churn the callback identity (the keyboard-shortcut effect
    // depends on this callback). They're stable enough for this path —
    // togglePlay is invoked imperatively at click/key time, not stored.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelAutoPlay]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Bail when the user is typing in any editable surface. TipTap (the
      // RichTextEditor used in the page builder) renders into a
      // contenteditable element, NOT a <textarea> — the original
      // HTMLInputElement/HTMLTextAreaElement check missed that and the
      // m/k/j/l/space shortcuts stole those keystrokes from the WYSIWYG.
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target?.isContentEditable ?? false)
      ) {
        return;
      }

      switch (e.key) {
        case " ":
          e.preventDefault();
          togglePlay();
          break;
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "j":
          e.preventDefault();
          if (audioRef.current) {
            const newTime = Math.max(0, audioRef.current.currentTime - 10);
            seekTo(newTime);
          }
          break;
        case "l":
          e.preventDefault();
          if (audioRef.current && estimatedDuration > 0) {
            const newTime = Math.min(estimatedDuration, audioRef.current.currentTime + 10);
            seekTo(newTime);
          }
          break;
        case "m":
          e.preventDefault();
          if (audioRef.current) {
            audioRef.current.muted = !audioRef.current.muted;
          }
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay, seekTo, estimatedDuration]);

  const playTrack = async (track: Track, autoPlay = true) => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
    }

    setCurrentTrack(track);
    onPlayingChange(false);
    setProgress(0);
    setCurrentTime(0);
    setDuration(0);
    seekLoadingRef.current = false;
    setSeekLoading(false);

    // `playTrack` does the full HLS attach. Previously this branched on
    // `isDesignerMode` and short-circuited the loader, which broke clicks
    // in the page-builder canvas (no `src` ever got attached → bare
    // `play()` resolved against an empty media element silently). The
    // designer-mode flag now only affects visualizer demo mode and the
    // header badge — playback itself works identically in both hosts.
    const success = await loadSegmentedTrack(track.id, undefined, {
      hlsReady: track.hlsReady ?? false,
      duration: track.duration,
      waveformPeaks: track.waveformPeaks,
    });

    if (success && audioRef.current && autoPlay) {
      try {
        await audioRef.current.play();
        onPlayingChange(true);
      } catch (e) {
        logger.error({ error: formatError(e) }, "Playback failed");
      }
    }
  };

  const playNext = useCallback(() => {
    if (!currentTrack) return;

    trackEvent('player_control_click', {
      event_category: 'player',
      event_label: 'next_button',
      control: 'next',
    });

    const audio = audioRef.current;
    const currentIndex = tracks.findIndex(
      (t) => t.id === currentTrack.id
    );
    if (tracks.length === 0) return;
    const nextIndex = (currentIndex + 1) % tracks.length;
    const shouldPlay = audio ? !audio.paused : true;
    playTrack(tracks[nextIndex], shouldPlay);
  }, [currentTrack, tracks]);

  const playPrev = () => {
    if (!currentTrack) return;

    trackEvent('player_control_click', {
      event_category: 'player',
      event_label: 'previous_button',
      control: 'previous',
    });

    const audio = audioRef.current;

    if (audio && audio.paused && audio.currentTime > 3) {
      audio.currentTime = 0;
      setCurrentTime(0);
      setProgress(0);
      return;
    }

    const currentIndex = tracks.findIndex(
      (t) => t.id === currentTrack.id
    );
    if (tracks.length === 0) return;
    const prevIndex =
      currentIndex === 0 ? tracks.length - 1 : currentIndex - 1;
    const shouldPlay = audio ? !audio.paused : true;
    playTrack(tracks[prevIndex], shouldPlay);
  };

  const performSeek = (percent: number) => {
    const audio = audioRef.current;
    const effectiveDuration = duration || estimatedDuration;
    if (!audio || !effectiveDuration || effectiveDuration <= 0) return;

    const clampedPercent = Math.max(0, Math.min(1, percent));
    const newTime = clampedPercent * effectiveDuration;

    seekLoadingRef.current = true;
    setSeekLoading(true);
    setProgress(clampedPercent * 100);
    setCurrentTime(newTime);

    setTimeout(() => {
      if (seekLoadingRef.current) {
        seekLoadingRef.current = false;
        setSeekLoading(false);
      }
    }, 3000);

    seekTo(newTime);
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    performSeek(percent);
  };

  const handleProgressHover = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverPercent(percent);
  };

  const handleProgressLeave = () => {
    setHoverPercent(null);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const bar = progressBarRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    isDraggingRef.current = true;
    dragPercentRef.current = percent;
    setIsDragging(true);
    setDragPercent(percent);
    setHoverPercent(null);

    const moveHandler = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const barEl = progressBarRef.current;
      if (!barEl) return;
      const r = barEl.getBoundingClientRect();
      const p = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
      dragPercentRef.current = p;
      setDragPercent(p);
    };

    const upHandler = () => {
      if (mouseMoveHandlerRef.current) {
        document.removeEventListener("mousemove", mouseMoveHandlerRef.current);
      }
      if (mouseUpHandlerRef.current) {
        document.removeEventListener("mouseup", mouseUpHandlerRef.current);
      }
      mouseMoveHandlerRef.current = null;
      mouseUpHandlerRef.current = null;

      const finalPercent = dragPercentRef.current;
      isDraggingRef.current = false;
      setIsDragging(false);
      setHoverPercent(null);
      performSeek(finalPercent);
    };

    mouseMoveHandlerRef.current = moveHandler;
    mouseUpHandlerRef.current = upHandler;
    document.addEventListener("mousemove", moveHandler);
    document.addEventListener("mouseup", upHandler);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    setHoverPercent(null);
    const bar = progressBarRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const touch = e.touches[0];
    const percent = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    isDraggingRef.current = true;
    dragPercentRef.current = percent;
    setIsDragging(true);
    setDragPercent(percent);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    e.preventDefault();
    const bar = progressBarRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const touch = e.touches[0];
    const percent = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    dragPercentRef.current = percent;
    setDragPercent(percent);
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    setHoverPercent(null);
    if (!isDraggingRef.current) {
      setIsDragging(false);
      return;
    }
    const finalPercent = dragPercentRef.current;
    isDraggingRef.current = false;
    setIsDragging(false);
    performSeek(finalPercent);
  };

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const hasSocialLinks = socialLinksSettings && socialLinksSettings.links.length > 0;
  const hasSidebar = imageUrls.profile || bandDescription || hasSocialLinks;

  // Autoplay on mount — fires once per currentTrack id when the consumer asks
  // for it and we're not in the page-builder canvas's edit mode. We capture
  // `playTrack` through a ref so this effect doesn't churn on every render.
  // Browser autoplay policies may still reject the play() call when there's
  // no prior user gesture; the rejection is caught silently inside playTrack.
  const playTrackRef = useRef(playTrack);
  useEffect(() => {
    playTrackRef.current = playTrack;
  });
  const autoplayedTrackIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!autoplay) return;
    if (isDesignerMode) return;
    if (!currentTrack) return;
    if (autoplayedTrackIdRef.current === currentTrack.id) return;
    autoplayedTrackIdRef.current = currentTrack.id;
    // Tiny defer so any mount-time load* / DOM wiring is in place first.
    const t = setTimeout(() => {
      playTrackRef.current(currentTrack);
    }, 50);
    return () => clearTimeout(t);
  }, [autoplay, isDesignerMode, currentTrack]);

  // ──────────────────────────────────────────────────────────────────────
  // Minimal variant — three-row "wave strip":
  //   Row 1: prev / play / next  ·  title (marquee) + artist + time  ·  mini-viz
  //   Row 2: thin click-to-seek progress bar
  //   Row 3: horizontal-scrolling track pills
  // Reuses every audio handler and state slot from the full layout; no new
  // hooks, no separate refs.
  // ──────────────────────────────────────────────────────────────────────
  if (variant === "minimal") {
    const compactVisualizerProps = {
      audioElement,
      isPlaying,
      currentTime,
      duration,
      waveformPeaks: audio.waveformPeaks ?? currentTrack?.waveformPeaks ?? null,
      borderShow: cardStyles?.visualizerBorderShow,
      borderColor: cardStyles?.visualizerBorderColor,
      borderRadius: cardStyles?.visualizerBorderRadius,
      blendMode: cardStyles?.visualizerBlendMode,
    };
    const compactVisualizer = effectiveVisualizerType === "waveform" ? (
      <WaveformProgress
        {...compactVisualizerProps}
        className="w-full h-full"
      />
    ) : (
      <AudioVisualizer
        {...compactVisualizerProps}
        pcmAnalyser={pcmAnalyser}
        demoMode={false}
        className="w-full h-full"
      />
    );
    const playBtnRadius = (() => {
      const r = cardStyles?.playButtonBorderRadius ?? 50;
      if (typeof r === "number") return `${r}%`;
      return `${r.tl}% ${r.tr}% ${r.br}% ${r.bl}%`;
    })();
    const totalDurForSeek = duration || estimatedDuration;
    return (
      <div
        className={embedded ? "relative" : "relative min-h-screen"}
        onContextMenu={(e) => e.preventDefault()}
      >
        <style>{`
          @keyframes playerview-marquee-pingpong {
            0%, 15% { transform: translateX(0); }
            50%, 65% { transform: translateX(var(--marquee-shift, 0)); }
            100% { transform: translateX(0); }
          }
        `}</style>
        <CardContainer
          cardStyles={cardStyles}
          className="overflow-hidden max-w-full"
        >
          {/* Row 1 — controls / title + meta / mini visualizer */}
          <div className="flex items-center gap-3 px-3 py-2.5 min-w-0">
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={playPrev}
                aria-label="Previous track"
                className="p-1.5 transition hover:opacity-80 cursor-pointer"
                style={{
                  color: cardStyles?.contentColor,
                  borderRadius: borderRadiusToCSS(cardStyles?.buttonBorderRadius, 24),
                }}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={togglePlay}
                aria-label={isLoading || seekLoading ? "Loading" : isPlaying ? "Pause" : "Play"}
                aria-busy={isLoading || seekLoading}
                className="p-2 hover:scale-105 transition cursor-pointer"
                style={{
                  borderRadius: playBtnRadius,
                  backgroundColor: "var(--color-primary)",
                  color: "var(--color-primary-text)",
                }}
              >
                {isLoading || seekLoading ? (
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : isPlaying ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                onClick={playNext}
                aria-label="Next track"
                className="p-1.5 transition hover:opacity-80 cursor-pointer"
                style={{
                  color: cardStyles?.contentColor,
                  borderRadius: borderRadiusToCSS(cardStyles?.buttonBorderRadius, 24),
                }}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                </svg>
              </button>
            </div>
            <div className="flex-1 min-w-0">
              {currentTrack ? (
                <>
                  <div
                    className="text-sm font-semibold"
                    style={{ color: cardStyles?.headingColor }}
                  >
                    <TrackTitle text={currentTrack.title} playing={isPlaying} />
                  </div>
                  <p
                    className="text-xs truncate max-w-full mt-0.5"
                    style={{ color: cardStyles?.mutedColor }}
                  >
                    {currentTrack.artist ? `${currentTrack.artist} · ` : ""}
                    {formatTime(currentTime)} / {formatTime(totalDurForSeek)}
                  </p>
                </>
              ) : (
                <div className="text-sm" style={{ color: cardStyles?.mutedColor }}>
                  No track selected
                </div>
              )}
            </div>
            {showVisualizer && (
              <div
                className="w-28 sm:w-36 h-12 shrink-0 overflow-hidden"
                style={{
                  borderRadius: borderRadiusToCSS(
                    cardStyles?.visualizerBorderRadius,
                    8
                  ),
                }}
                aria-hidden="true"
              >
                {compactVisualizer}
              </div>
            )}
          </div>
          {/* Row 2 — thin click-to-seek progress bar */}
          <div
            role="slider"
            tabIndex={0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
            aria-label="Audio progress"
            className="relative h-1 cursor-pointer"
            style={{ backgroundColor: "color-mix(in srgb, var(--color-accent) 18%, transparent)" }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              if (totalDurForSeek > 0) {
                seekLoadingRef.current = true;
                setSeekLoading(true);
                void seekTo(totalDurForSeek * percent).finally(() => {
                  seekLoadingRef.current = false;
                  setSeekLoading(false);
                });
              }
            }}
          >
            <div
              className="absolute top-0 bottom-0 left-0"
              style={{ width: `${progress}%`, backgroundColor: "var(--color-accent)" }}
            />
          </div>
          {/* Row 3 — horizontal track pills */}
          {showPlaylist && tracks.length > 0 && (
            <div className="flex gap-1.5 px-3 py-2 overflow-x-auto no-scrollbar">
              {tracks.map((track, idx) => {
                const isCurrent = currentTrack?.id === track.id;
                const isCurrentPlaying = isCurrent && isPlaying;
                return (
                  <button
                    key={track.id}
                    type="button"
                    onClick={() => {
                      if (isCurrentPlaying) {
                        audioRef.current?.pause();
                        onPlayingChange(false);
                      } else if (
                        isCurrent &&
                        !isPlaying &&
                        !isLoading &&
                        !!audioRef.current?.currentSrc
                      ) {
                        audioRef.current
                          ?.play()
                          .then(() => onPlayingChange(true))
                          .catch(() => {});
                      } else {
                        playTrack(track);
                      }
                    }}
                    className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full transition cursor-pointer"
                    style={{
                      backgroundColor: isCurrent
                        ? "color-mix(in srgb, var(--color-accent) 16%, transparent)"
                        : "color-mix(in srgb, var(--color-text-primary) 6%, transparent)",
                      color: isCurrent
                        ? "var(--color-accent)"
                        : cardStyles?.contentColor,
                    }}
                    title={track.title}
                    aria-current={isCurrent ? "true" : undefined}
                  >
                    <span className="tabular-nums opacity-70">{idx + 1}</span>
                    {showTrackImage && track.image && (
                      <img
                        src={track.image}
                        alt=""
                        aria-hidden="true"
                        className="w-4 h-4 rounded object-cover shrink-0"
                        loading="lazy"
                      />
                    )}
                    <span className="truncate max-w-[140px]">{track.title}</span>
                  </button>
                );
              })}
            </div>
          )}
        </CardContainer>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // Compact variant — vertically stacked card sized for sidebars / hero
  // strips. Sits between the minimal "wave strip" and the full hero:
  //   • A 96px-tall visualizer banner at the top.
  //   • Title + artist + total time row.
  //   • Click-to-seek progress bar (4px) with current-time anchor.
  //   • Centered prev / play / next cluster.
  //   • Single-column dense playlist (no thumbnails) when there's >1 track.
  // Reuses the same handlers as the full layout. The visualizer's height
  // ladder is intentionally smaller (h-24) than the full hero so the block
  // can live in a narrow column without dominating the page.
  // ──────────────────────────────────────────────────────────────────────
  if (variant === "compact") {
    const compactVizProps = {
      audioElement,
      isPlaying,
      currentTime,
      duration,
      waveformPeaks: audio.waveformPeaks ?? currentTrack?.waveformPeaks ?? null,
      borderShow: cardStyles?.visualizerBorderShow,
      borderColor: cardStyles?.visualizerBorderColor,
      borderRadius: cardStyles?.visualizerBorderRadius,
      blendMode: cardStyles?.visualizerBlendMode,
    };
    const compactVizEl =
      effectiveVisualizerType === "waveform" ? (
        <WaveformProgress {...compactVizProps} className="w-full h-full" />
      ) : (
        <AudioVisualizer
          {...compactVizProps}
          pcmAnalyser={pcmAnalyser}
          demoMode={false}
          className="w-full h-full"
        />
      );
    const compactPlayBtnRadius = (() => {
      const r = cardStyles?.playButtonBorderRadius ?? 50;
      if (typeof r === "number") return `${r}%`;
      return `${r.tl}% ${r.tr}% ${r.br}% ${r.bl}%`;
    })();
    const compactTotalDur = duration || estimatedDuration;
    return (
      <div
        className={embedded ? "relative" : "relative min-h-screen"}
        onContextMenu={(e) => e.preventDefault()}
      >
        <style>{`
          @keyframes playerview-marquee-pingpong {
            0%, 15% { transform: translateX(0); }
            50%, 65% { transform: translateX(var(--marquee-shift, 0)); }
            100% { transform: translateX(0); }
          }
        `}</style>
        <CardContainer
          cardStyles={cardStyles}
          className="overflow-hidden max-w-full p-4 space-y-3"
        >
          {/* Visualizer banner — shorter than the full hero's, still
              respects the theme's visualizer border radius. */}
          {showVisualizer && (
            <div
              className="h-24 overflow-hidden"
              style={{
                borderRadius: borderRadiusToCSS(
                  cardStyles?.visualizerBorderRadius,
                  8
                ),
              }}
            >
              {compactVizEl}
            </div>
          )}

          {/* Title + artist + total time */}
          <div className="flex items-start justify-between gap-3 min-w-0">
            <div className="flex-1 min-w-0">
              {currentTrack ? (
                <>
                  <div
                    className="text-base font-semibold"
                    style={{ color: cardStyles?.headingColor }}
                  >
                    <TrackTitle text={currentTrack.title} playing={isPlaying} />
                  </div>
                  {currentTrack.artist && (
                    <p
                      className="text-xs truncate max-w-full mt-0.5"
                      style={{ color: cardStyles?.mutedColor }}
                    >
                      {currentTrack.artist}
                    </p>
                  )}
                </>
              ) : (
                <div
                  className="text-sm"
                  style={{ color: cardStyles?.mutedColor }}
                >
                  No track selected
                </div>
              )}
            </div>
            <span
              className="text-xs tabular-nums shrink-0 mt-0.5"
              style={{ color: cardStyles?.mutedColor }}
            >
              {formatTime(compactTotalDur)}
            </span>
          </div>

          {/* Progress bar — taller than the minimal variant's hairline.
              Click-to-seek (drag handled by the full layout only). */}
          <div className="space-y-1">
            <div
              role="slider"
              tabIndex={0}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
              aria-label="Audio progress"
              className="relative h-1.5 rounded-full cursor-pointer"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--color-accent) 18%, transparent)",
              }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const percent = Math.max(
                  0,
                  Math.min(1, (e.clientX - rect.left) / rect.width)
                );
                if (compactTotalDur > 0) {
                  seekLoadingRef.current = true;
                  setSeekLoading(true);
                  void seekTo(compactTotalDur * percent).finally(() => {
                    seekLoadingRef.current = false;
                    setSeekLoading(false);
                  });
                }
              }}
            >
              <div
                className="absolute top-0 bottom-0 left-0 rounded-full"
                style={{
                  width: `${progress}%`,
                  backgroundColor: "var(--color-accent)",
                }}
              />
            </div>
            <div
              className="flex justify-between text-[11px] tabular-nums"
              style={{ color: cardStyles?.mutedColor }}
            >
              <span>{formatTime(currentTime)}</span>
              <span>{compactTotalDur > 0 ? `-${formatTime(Math.max(0, compactTotalDur - currentTime))}` : ""}</span>
            </div>
          </div>

          {/* Centered controls cluster */}
          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={playPrev}
              aria-label="Previous track"
              className="p-2 transition hover:opacity-80 cursor-pointer"
              style={{
                color: cardStyles?.contentColor,
                borderRadius: borderRadiusToCSS(
                  cardStyles?.buttonBorderRadius,
                  24
                ),
              }}
            >
              <svg
                className="w-6 h-6"
                fill="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={togglePlay}
              aria-label={
                isLoading || seekLoading
                  ? "Loading"
                  : isPlaying
                    ? "Pause"
                    : "Play"
              }
              aria-busy={isLoading || seekLoading}
              className="p-3 hover:scale-105 transition cursor-pointer"
              style={{
                borderRadius: compactPlayBtnRadius,
                backgroundColor: "var(--color-primary)",
                color: "var(--color-primary-text)",
              }}
            >
              {isLoading || seekLoading ? (
                <svg
                  className="w-7 h-7 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              ) : isPlaying ? (
                <svg
                  className="w-7 h-7"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                </svg>
              ) : (
                <svg
                  className="w-7 h-7"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={playNext}
              aria-label="Next track"
              className="p-2 transition hover:opacity-80 cursor-pointer"
              style={{
                color: cardStyles?.contentColor,
                borderRadius: borderRadiusToCSS(
                  cardStyles?.buttonBorderRadius,
                  24
                ),
              }}
            >
              <svg
                className="w-6 h-6"
                fill="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
            </button>
          </div>

          {/* Dense single-column playlist — only when there's >1 track. */}
          {showPlaylist && tracks.length > 1 && (
            <div
              className="pt-3 border-t flex flex-col"
              style={{
                borderColor:
                  "color-mix(in srgb, var(--color-text-primary) 8%, transparent)",
              }}
              role="list"
            >
              {tracks.map((track, idx) => {
                const isCurrent = currentTrack?.id === track.id;
                const isCurrentPlaying = isCurrent && isPlaying;
                return (
                  <button
                    key={track.id}
                    type="button"
                    role="listitem"
                    onClick={() => {
                      if (isCurrentPlaying) {
                        audioRef.current?.pause();
                        onPlayingChange(false);
                      } else if (
                        isCurrent &&
                        !isPlaying &&
                        !isLoading &&
                        !!audioRef.current?.currentSrc
                      ) {
                        audioRef.current
                          ?.play()
                          .then(() => onPlayingChange(true))
                          .catch(() => {});
                      } else {
                        playTrack(track);
                      }
                    }}
                    className="w-full text-left flex items-center gap-2 px-1.5 py-1.5 rounded transition cursor-pointer"
                    style={{
                      backgroundColor: isCurrent
                        ? "color-mix(in srgb, var(--color-accent) 10%, transparent)"
                        : "transparent",
                    }}
                    aria-current={isCurrent ? "true" : undefined}
                  >
                    <span
                      className="w-5 text-xs tabular-nums shrink-0 text-center"
                      style={{
                        color: isCurrent
                          ? "var(--color-accent)"
                          : cardStyles?.mutedColor,
                      }}
                    >
                      {idx + 1}
                    </span>
                    {showTrackImage && track.image && (
                      <img
                        src={track.image}
                        alt=""
                        aria-hidden="true"
                        className="w-5 h-5 rounded object-cover shrink-0"
                        loading="lazy"
                      />
                    )}
                    <span
                      className="flex-1 min-w-0 truncate text-sm"
                      style={{
                        color: isCurrent
                          ? "var(--color-accent)"
                          : cardStyles?.contentColor,
                      }}
                    >
                      {track.title}
                    </span>
                    {track.duration && track.duration > 0 && (
                      <span
                        className="text-[11px] tabular-nums shrink-0"
                        style={{ color: cardStyles?.mutedColor }}
                      >
                        {formatTime(track.duration)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </CardContainer>
      </div>
    );
  }

  return (
    <div
      className={embedded ? "relative" : "relative min-h-screen"}
      // Player container chrome — when `playerContainerEnabled` is true,
      // the theme-driven bg / backdrop / border / radius wrap the entire
      // player frame. Disabled state is a no-op object (empty `style`),
      // so the legacy unstyled wrapper renders identically.
      style={playerRegionStyle(cardStyles?.playerContainer)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Keyframes for the track-title marquee. Ping-pong: hold-start →
          slide-left to expose the tail (right-to-left) → hold-end → slide
          back to the start (left-to-right) → repeat. The shift distance is
          measured per-instance and injected as `--marquee-shift`. */}
      <style>{`
        @keyframes playerview-marquee-pingpong {
          0%, 15% { transform: translateX(0); }
          50%, 65% { transform: translateX(var(--marquee-shift, 0)); }
          100% { transform: translateX(0); }
        }
      `}</style>
      {/* Background Image — fullscreen lobby treatment, skipped when the
          player is embedded as a block inside another layout. */}
      {!embedded && imageUrls.background && (
        <div className="fixed inset-0 -z-20">
          {imageUrls.backgroundDark ? (
            <PictureImage
              sources={[
                { media: "(prefers-color-scheme: dark)", src: imageUrls.backgroundDark, widths: [960, 1920, 2560] },
              ]}
              fallback={{ src: imageUrls.background, widths: [960, 1920, 2560], sizes: "100vw" }}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <ResponsiveImage
              src={imageUrls.background}
              alt=""
              widths={[960, 1920, 2560]}
              sizes="100vw"
              className="h-full w-full object-cover"
              width={1600}
              height={1200}
            />
          )}
        </div>
      )}
      {!embedded && <div className="fixed inset-0 -z-10 bg-black/70" />}

      {!embedded && isDesignerMode && (
        // Designer-mode badge only — the Logout button moved out of the
        // player entirely (it's part of the lobby page now, rendered by
        // the consuming route at `apps/lobby/app/routes/_index.tsx`). The
        // badge stays here because it's a player-specific designer hint.
        <header className="container mx-auto px-4 pt-4 max-w-6xl flex justify-end items-center gap-3">
          <span
            className="px-4 py-2 text-sm"
            style={{
              borderRadius: borderRadiusToCSS(cardStyles?.buttonBorderRadius, 24),
              backgroundColor: "rgba(59, 130, 246, 0.2)",
              color: "#60a5fa",
            }}
          >
            Designer Preview
          </span>
        </header>
      )}

      <main
        className={embedded ? "w-full" : "container mx-auto px-4 py-8 max-w-6xl"}
        style={{ color: "var(--color-text-primary)" }}
      >
        {imageUrls.banner && (
          <div className="mb-8">
            {imageUrls.bannerDark ? (
              <PictureImage
                sources={[
                  { media: "(prefers-color-scheme: dark)", src: imageUrls.bannerDark, widths: [640, 960, 1280, 1920] },
                ]}
                fallback={{ src: imageUrls.banner, widths: [640, 960, 1280, 1920], sizes: "100vw" }}
                alt="Banner"
                className="w-full h-auto object-contain rounded-xl"
              />
            ) : (
              <ResponsiveImage
                src={imageUrls.banner}
                alt="Banner"
                widths={[640, 960, 1280, 1920]}
                sizes="100vw"
                width={3200}
                height={1600}
                className="w-full h-auto object-contain rounded-xl"
              />
            )}
          </div>
        )}

        {socialLinksSettings &&
          socialLinksSettings.placement === "above-content" &&
          (socialLinksSettings.links.length > 0 || socialLinksSettings.title || socialLinksSettings.contentBefore || socialLinksSettings.contentAfter) && (
          <div className="mb-8">
            <CardContainer cardStyles={cardStyles} className="backdrop-blur p-4">
              <SocialLinks
                settings={socialLinksSettings}
                headingColor={cardStyles?.headingColor}
                contentColor={cardStyles?.contentColor}
              />
            </CardContainer>
          </div>
        )}

        <div
          className={`grid gap-8 ${
            hasSidebar ? "lg:grid-cols-[minmax(0,1fr)_300px]" : ""
          }`}
        >
          {/* min-w-0 is critical on the main column: a CSS grid track defaults
              to `auto` (= min-content), so unbreakable text inside the playlist
              would otherwise widen the track past the viewport on mobile. */}
          <div className="space-y-6 min-w-0 max-w-full">
            {socialLinksSettings &&
              socialLinksSettings.placement === "above-left" &&
              (socialLinksSettings.links.length > 0 || socialLinksSettings.title || socialLinksSettings.contentBefore || socialLinksSettings.contentAfter) && (
              <CardContainer cardStyles={cardStyles} className="backdrop-blur p-4">
                <SocialLinks
                  settings={socialLinksSettings}
                  headingColor={cardStyles?.headingColor}
                  contentColor={cardStyles?.contentColor}
                />
              </CardContainer>
            )}

            {showVisualizer &&
              (() => {
                const visualizerProps = {
                  audioElement,
                  isPlaying,
                  currentTime,
                  duration,
                  waveformPeaks: audio.waveformPeaks ?? currentTrack?.waveformPeaks ?? null,
                  borderShow: cardStyles?.visualizerBorderShow,
                  borderColor: cardStyles?.visualizerBorderColor,
                  borderRadius: cardStyles?.visualizerBorderRadius,
                  blendMode: cardStyles?.visualizerBlendMode,
                };
                const VisualizerEl = effectiveVisualizerType === "waveform" ? (
                  <WaveformProgress {...visualizerProps} />
                ) : (
                  <AudioVisualizer
                    {...visualizerProps}
                    pcmAnalyser={pcmAnalyser}
                    // Switch demoMode based on designer + play state so the
                    // page-builder canvas updates the visualizer the moment
                    // a designer changes a color, without breaking real
                    // playback:
                    //   - design mode & not playing → demoMode (synthetic
                    //     animation reads the current theme colors every
                    //     frame, so edits show up live).
                    //   - design mode & playing     → real audio path.
                    //   - lobby mode (any state)    → real audio path.
                    demoMode={isDesignerMode && !isPlaying}
                  />
                );

                // Visualizer container chrome — when the new
                // `visualizerContainer.enabled` is true, the theme's
                // bg/backdrop/border/radius wrap the visualizer banner.
                // When the toggle is off, the visualizer renders with no
                // wrapping chrome at all: no card-derived background, no
                // padding, just the bare canvas. The legacy
                // `visualizerUseCardBg` field is ignored on purpose so
                // unchecking "Visualizer container" reliably produces a
                // transparent banner.
                const containerChrome = playerRegionStyle(
                  cardStyles?.visualizerContainer
                );
                const hasContainerChrome =
                  Object.keys(containerChrome).length > 0;
                return hasContainerChrome ? (
                  <div className="overflow-hidden" style={containerChrome}>
                    {VisualizerEl}
                  </div>
                ) : (
                  <div className="overflow-hidden">
                    {VisualizerEl}
                  </div>
                );
              })()}

            {/* Transport container — wraps the current-song info + progress
                bar + transport buttons in a single region the theme can
                style independently. When `transportContainer.enabled` is
                false, the wrapper renders with NO chrome (empty `style`),
                so layout matches the legacy three-siblings-in-space-y-6
                arrangement exactly. The inner padding comes from the
                content-level `transportPaddingCSS` (independent of the
                container toggle) so a designer can pad the controls even
                when the container chrome stays invisible. */}
            <div
              className="space-y-6"
              style={{
                ...playerRegionStyle(cardStyles?.transportContainer),
                ...(cardStyles?.transportPaddingCSS
                  ? { padding: cardStyles.transportPaddingCSS }
                  : {}),
              }}
            >
            {currentTrack && (
              <div className="text-center max-w-full overflow-hidden">
                <h2
                  className="text-2xl font-bold"
                  style={
                    cardStyles?.transportTextColor
                      ? { color: cardStyles.transportTextColor }
                      : undefined
                  }
                >
                  <TrackTitle text={currentTrack.title} playing={isPlaying} />
                </h2>
                {currentTrack.artist && (
                  <p
                    className="truncate"
                    style={{
                      color:
                        cardStyles?.transportTextColor ??
                        "var(--color-text-secondary)",
                    }}
                  >
                    {currentTrack.artist}
                  </p>
                )}
              </div>
            )}

            <div className="py-2 sm:py-0">
              <div
                ref={progressBarRef}
                role="slider"
                tabIndex={0}
                aria-label="Audio progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(isDragging ? dragPercent * 100 : progress)}
                aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration || estimatedDuration)}`}
                className="group relative h-2 rounded-full cursor-pointer touch-none focus-visible:ring-2 focus-visible:ring-offset-2"
                style={{
                  backgroundColor:
                    cardStyles?.progressBarColor ??
                    "color-mix(in srgb, var(--color-accent) 20%, transparent)",
                }}
                onClick={seek}
                onMouseDown={handleMouseDown}
                onMouseMove={handleProgressHover}
                onMouseLeave={handleProgressLeave}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
                onKeyDown={(e) => {
                  const effectiveDuration = duration || estimatedDuration;
                  if (!effectiveDuration || effectiveDuration <= 0) return;

                  let newPercent: number | null = null;
                  const currentPercent = progress / 100;
                  const step = 0.05;
                  const largeStep = 0.1;

                  switch (e.key) {
                    case "ArrowRight":
                    case "ArrowUp":
                      newPercent = Math.min(1, currentPercent + step);
                      break;
                    case "ArrowLeft":
                    case "ArrowDown":
                      newPercent = Math.max(0, currentPercent - step);
                      break;
                    case "PageUp":
                      newPercent = Math.min(1, currentPercent + largeStep);
                      break;
                    case "PageDown":
                      newPercent = Math.max(0, currentPercent - largeStep);
                      break;
                    case "Home":
                      newPercent = 0;
                      break;
                    case "End":
                      newPercent = 1;
                      break;
                  }

                  if (newPercent !== null) {
                    e.preventDefault();
                    performSeek(newPercent);
                  }
                }}
              >
                {loadingProgress > 0 && (
                  <div
                    className="absolute top-0 bottom-0 rounded-full"
                    style={{ width: `${loadingProgress}%`, backgroundColor: "color-mix(in srgb, var(--color-accent) 15%, transparent)" }}
                  />
                )}
                <div
                  className="absolute top-0 bottom-0 rounded-full"
                  style={{
                    width: `${isDragging ? dragPercent * 100 : progress}%`,
                    backgroundColor:
                      cardStyles?.progressBarActiveColor ??
                      "var(--color-accent)",
                  }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full shadow-md opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer"
                  style={{
                    left: `calc(${isDragging ? dragPercent * 100 : progress}% - 8px)`,
                    backgroundColor:
                      cardStyles?.progressBarActiveColor ??
                      "var(--color-accent)",
                  }}
                />
                {hoverPercent !== null && (duration || estimatedDuration) > 0 && (
                  <div
                    className="absolute -top-8 -translate-x-1/2 px-2 py-0.5 rounded bg-black/60 backdrop-blur-sm text-xs pointer-events-none"
                    style={{ left: `${hoverPercent * 100}%`, color: "var(--color-text-primary)" }}
                  >
                    {formatTime(hoverPercent * (duration || estimatedDuration))}
                  </div>
                )}
                {isDragging && (duration || estimatedDuration) > 0 && (
                  <div
                    className="absolute -top-8 -translate-x-1/2 px-2 py-0.5 rounded bg-black/60 backdrop-blur-sm text-xs pointer-events-none"
                    style={{ left: `${dragPercent * 100}%`, color: "var(--color-text-primary)" }}
                  >
                    {formatTime(dragPercent * (duration || estimatedDuration))}
                  </div>
                )}
              </div>
              <div
                className="flex justify-between text-sm mt-1"
                style={{
                  color:
                    cardStyles?.progressBarTextColor ??
                    "var(--color-text-secondary)",
                }}
              >
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration || estimatedDuration)}</span>
              </div>
            </div>

            <div
              id="player-controls"
              tabIndex={-1}
              className="flex justify-center items-center gap-6 focus:outline-none"
              role="group"
              aria-label="Playback controls"
            >
              <button
                onClick={playPrev}
                aria-label="Previous track"
                className="p-3 transition hover:opacity-80 cursor-pointer"
                style={skipButtonStyle(cardStyles)}
              >
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                </svg>
              </button>

              <button
                onClick={togglePlay}
                aria-label={isLoading || seekLoading ? "Loading" : isPlaying ? "Pause" : "Play"}
                aria-busy={isLoading || seekLoading}
                className="p-4 hover:scale-105 transition cursor-pointer"
                style={playButtonStyle(cardStyles)}
              >
                {isLoading || seekLoading ? (
                  <svg className="w-10 h-10 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : isPlaying ? (
                  <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                  </svg>
                ) : (
                  <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              <button
                onClick={playNext}
                aria-label="Next track"
                className="p-3 transition hover:opacity-80 cursor-pointer"
                style={skipButtonStyle(cardStyles)}
              >
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                </svg>
              </button>
            </div>
            </div>{/* end transport container */}

            {showPlaylist && (() => {
              // Playlist container chrome — strictly opt-in via
              // `playlistContainerEnabled`. The legacy fallback used to
              // paint `cardStyles.bg` whenever the override was disabled,
              // which made the playlist render with the card background
              // even when the designer hadn't asked for it. Now: when the
              // region is disabled (or unset), the playlist renders as a
              // plain transparent block with zero chrome — just the title
              // and the rows.
              const playlistRegion = cardStyles?.playlistContainer;
              const containerEnabled = !!playlistRegion?.enabled;
              const containerStyle: React.CSSProperties = containerEnabled
                ? playerRegionStyle(playlistRegion)
                : {};
              // Padding only when the container is enabled — backdrop-filter
              // is no longer baked in via a Tailwind class; it now comes from
              // `playerRegionStyle` (theme `playlistBackdropFilter`) only,
              // so an enabled container with no configured filter doesn't
              // silently apply a blur.
              const containerClass = containerEnabled
                ? "p-4 max-w-full overflow-hidden"
                : "max-w-full overflow-hidden";
              return (
                <div className={containerClass} style={containerStyle}>
                  <h3
                    id="playlist-heading"
                    className="text-lg font-semibold mb-4 ml-3"
                    style={{
                      color:
                        cardStyles?.playlistTitleColor ??
                        cardStyles?.headingColor,
                    }}
                  >
                    Playlist
                  </h3>
                  <div
                    className="flex flex-col"
                    role="list"
                    aria-labelledby="playlist-heading"
                    style={{ gap: cardStyles?.playlistGap ?? "0" }}
                  >
                {tracks.map((track, index) => {
                  const isCurrent = currentTrack?.id === track.id;
                  const isHovered = hoveredTrackId === track.id;
                  const isCurrentPlaying = isCurrent && isPlaying;
                  const isCurrentLoading = isCurrent && isLoading;

                  const trackStatus = isCurrentLoading
                    ? "Loading"
                    : isCurrentPlaying
                    ? "Now playing"
                    : isCurrent
                    ? "Selected"
                    : "";
                  const accessibleLabel = `${track.title}${track.artist ? ` by ${track.artist}` : ""}${trackStatus ? `. ${trackStatus}` : ""}`;

                  // Per-state colour resolution. Theme exposes:
                  //   • bg per state (trackBg / trackHoverBg / trackActiveBg)
                  //     with an `*IsGradient` flag from buildCardStyles so we
                  //     pick `background` vs `backgroundColor` below
                  //   • title text (trackText / Hover / Active)
                  //   • number / icon (trackNumberText / Hover / Active) —
                  //     paints the index digit AND every glyph in the left
                  //     control slot (loader, paused, hover play icon)
                  //   • time text (trackTimeText / Hover / Active)
                  //   • artist text — single value, `trackMutedText`
                  // Each falls back through hover→normal→legacy card/accent
                  // so themes that never set a field render exactly as before.
                  const trackBgIsGradient = isCurrent
                    ? cardStyles?.trackActiveBgIsGradient ?? false
                    : isHovered
                      ? (cardStyles?.trackHoverBg
                          ? cardStyles?.trackHoverBgIsGradient
                          : cardStyles?.trackBgIsGradient) ?? false
                      : cardStyles?.trackBgIsGradient ?? false;
                  const trackBg = isCurrent
                    ? cardStyles?.trackActiveBg ??
                      "color-mix(in srgb, var(--color-accent) 10%, transparent)"
                    : isHovered
                      ? cardStyles?.trackHoverBg ??
                        cardStyles?.trackBg ??
                        "transparent"
                      : cardStyles?.trackBg ?? "transparent";
                  const trackTextColor = isCurrent
                    ? cardStyles?.trackActiveText ?? "var(--color-accent)"
                    : isHovered
                      ? cardStyles?.trackHoverText ??
                        cardStyles?.trackText ??
                        cardStyles?.contentColor
                      : cardStyles?.trackText ?? cardStyles?.contentColor;
                  const trackNumberColor = isCurrent
                    ? cardStyles?.trackActiveNumberText ??
                      cardStyles?.trackActiveText ??
                      "var(--color-accent)"
                    : isHovered
                      ? cardStyles?.trackHoverNumberText ??
                        cardStyles?.trackNumberText ??
                        cardStyles?.trackMutedText ??
                        cardStyles?.mutedColor
                      : cardStyles?.trackNumberText ??
                        cardStyles?.trackMutedText ??
                        cardStyles?.mutedColor;
                  const trackTimeColor = isCurrent
                    ? cardStyles?.trackActiveTimeText ??
                      cardStyles?.trackMutedText ??
                      cardStyles?.mutedColor
                    : isHovered
                      ? cardStyles?.trackHoverTimeText ??
                        cardStyles?.trackTimeText ??
                        cardStyles?.trackMutedText ??
                        cardStyles?.mutedColor
                      : cardStyles?.trackTimeText ??
                        cardStyles?.trackMutedText ??
                        cardStyles?.mutedColor;
                  const trackArtistColor =
                    cardStyles?.trackMutedText ?? cardStyles?.mutedColor;
                  return (
                    <button
                      key={track.id}
                      role="listitem"
                      aria-current={isCurrent ? "true" : undefined}
                      aria-label={accessibleLabel}
                      onClick={() => {
                        if (isCurrentPlaying) {
                          audioRef.current?.pause();
                          onPlayingChange(false);

                          trackEvent('track_click', {
                            event_category: 'playlist',
                            event_label: track.title,
                            track_id: track.id,
                            track_artist: track.artist,
                            action: 'pause',
                            position: index + 1,
                          });
                        } else if (
                          isCurrent &&
                          !isPlaying &&
                          !isLoading &&
                          // Only attempt a bare `play()` resume if the <audio>
                          // element already has a source attached. In the
                          // page-builder canvas the parent doesn't pre-load
                          // the initial track (unlike the lobby route, which
                          // has a `useEffect` that calls `loadTrack` on mount),
                          // so the very first click on the default-selected
                          // current track would otherwise hit `play()` on an
                          // empty media element and produce no audio. Falling
                          // through to `playTrack(track)` makes the click
                          // bulletproof in both rendering hosts.
                          !!audioRef.current?.currentSrc
                        ) {
                          audioRef.current?.play().then(() => onPlayingChange(true)).catch(() => {});

                          trackEvent('track_click', {
                            event_category: 'playlist',
                            event_label: track.title,
                            track_id: track.id,
                            track_artist: track.artist,
                            action: 'resume',
                            position: index + 1,
                          });
                        } else {
                          playTrack(track);

                          trackEvent('track_click', {
                            event_category: 'playlist',
                            event_label: track.title,
                            track_id: track.id,
                            track_artist: track.artist,
                            action: 'select',
                            position: index + 1,
                          });
                        }
                      }}
                      onMouseEnter={() => setHoveredTrackId(track.id)}
                      onMouseLeave={() => setHoveredTrackId(null)}
                      className="w-full max-w-full text-left py-2 pr-3 rounded-lg transition flex items-center gap-3 group cursor-pointer text-[13px] md:text-base"
                      style={
                        trackBgIsGradient
                          ? { background: trackBg }
                          : { backgroundColor: trackBg }
                      }
                    >
                      <div className="w-6 flex items-center justify-center shrink-0" aria-hidden="true">
                        {isCurrentLoading ? (
                          <svg className="w-4 h-4 animate-spin" style={{ color: trackNumberColor }} fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : isCurrentPlaying && !isHovered ? (
                          <svg className="w-4 h-4" style={{ color: trackNumberColor }} fill="currentColor" viewBox="0 0 24 24">
                            <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                          </svg>
                        ) : isCurrentPlaying && isHovered ? (
                          <svg className="w-4 h-4" style={{ color: trackNumberColor }} fill="currentColor" viewBox="0 0 24 24">
                            <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                          </svg>
                        ) : isHovered ? (
                          <svg className="w-4 h-4" style={{ color: trackNumberColor }} fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        ) : (
                          <span
                            className="text-[13px] md:text-sm tabular-nums"
                            style={{ color: trackNumberColor }}
                          >
                            {index + 1}
                          </span>
                        )}
                      </div>
                      {showTrackImage && track.image && (
                        <img
                          src={track.image}
                          alt=""
                          aria-hidden="true"
                          className="w-8 h-8 md:w-10 md:h-10 rounded object-cover shrink-0"
                          loading="lazy"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <TrackTitle
                          text={track.title}
                          playing={isCurrentPlaying}
                          className="font-medium"
                          style={{ color: trackTextColor }}
                        />
                        {track.artist && track.artist !== "" && (
                          <p
                            className="text-[13px] md:text-sm truncate max-w-full"
                            style={{ color: trackArtistColor }}
                          >
                            {track.artist}
                          </p>
                        )}
                      </div>
                      {track.duration && track.duration > 0 && (
                        <span className="text-[13px] md:text-sm shrink-0" style={{ color: trackTimeColor }}>
                          {formatTime(track.duration)}
                        </span>
                      )}
                    </button>
                  );
                })}
                  </div>
                </div>
              );
            })()}

            {technicalInfo && (technicalInfo.title || technicalInfo.content) && (
              <CardContainer cardStyles={cardStyles} className="backdrop-blur p-4">
                {technicalInfo.title && (
                  <h3 className="text-lg font-semibold mb-4" style={{ color: cardStyles?.headingColor }}>
                    {technicalInfo.title}
                  </h3>
                )}
                {technicalInfo.content && (
                  <div
                    ref={technicalInfoRef}
                    className="text-sm prose-content"
                    style={{ color: cardStyles?.contentColor }}
                    dangerouslySetInnerHTML={{ __html: technicalInfo.content }}
                  />
                )}
              </CardContainer>
            )}

            {socialLinksSettings &&
              socialLinksSettings.placement === "below-left" &&
              (socialLinksSettings.links.length > 0 || socialLinksSettings.title || socialLinksSettings.contentBefore || socialLinksSettings.contentAfter) && (
              <CardContainer cardStyles={cardStyles} className="backdrop-blur p-4">
                <SocialLinks
                  settings={socialLinksSettings}
                  headingColor={cardStyles?.headingColor}
                  contentColor={cardStyles?.contentColor}
                />
              </CardContainer>
            )}
          </div>

          {hasSidebar && (
            <Sidebar
              imageUrls={imageUrls}
              bandName={bandName}
              bandDescription={bandDescription}
              cardStyles={cardStyles}
              socialLinksSettings={socialLinksSettings}
            />
          )}
        </div>

        {socialLinksSettings &&
          socialLinksSettings.placement === "below-content" &&
          (socialLinksSettings.links.length > 0 || socialLinksSettings.title || socialLinksSettings.contentBefore || socialLinksSettings.contentAfter) && (
          <div className="mt-8">
            <CardContainer cardStyles={cardStyles} className="backdrop-blur p-4">
              <SocialLinks
                settings={socialLinksSettings}
                headingColor={cardStyles?.headingColor}
                contentColor={cardStyles?.contentColor}
              />
            </CardContainer>
          </div>
        )}
      </main>
    </div>
  );
}
