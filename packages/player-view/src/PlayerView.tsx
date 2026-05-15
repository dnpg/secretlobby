import { useState, useEffect, useCallback, useRef, memo } from "react";
import { Form } from "react-router";
import { ResponsiveImage, PictureImage } from "@secretlobby/ui";
import { createLogger, formatError } from "@secretlobby/logger/client";
import { borderRadiusToCSS, type BorderRadius } from "@secretlobby/theme";
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
}

interface CardContainerProps {
  cardStyles?: CardStyles;
  children: React.ReactNode;
  className?: string;
}

function CardContainer({ cardStyles, children, className }: CardContainerProps) {
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
      audio.play().catch(() => {});

      trackEvent('player_control_click', {
        event_category: 'player',
        event_label: 'play_button',
        control: 'play',
      });
    }
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

    // In designer mode we don't pull audio from the network — we still flip
    // the UI to "selected" so the canvas reflects the click.
    if (isDesignerMode) {
      return;
    }

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

  return (
    <div
      className={embedded ? "relative" : "relative min-h-screen"}
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

      {!embedded && (
        <header className="container mx-auto px-4 pt-4 max-w-6xl flex justify-end items-center gap-3">
          {isDesignerMode ? (
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
          ) : (
            <Form method="post" action="/logout" reloadDocument>
              <input type="hidden" name="_csrf" value={csrfToken} />
              <button
                type="submit"
                className="px-4 py-2 text-sm transition cursor-pointer"
                style={{
                  borderRadius: borderRadiusToCSS(cardStyles?.buttonBorderRadius, 24),
                  backgroundColor: "var(--color-secondary)",
                  color: "var(--color-secondary-text)",
                }}
                onClick={() => {
                  trackEvent('logout', {
                    event_category: 'authentication',
                    method: 'button_click',
                  });
                }}
              >
                Logout
              </button>
            </Form>
          )}
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

            {(() => {
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
                  demoMode={isDesignerMode}
                />
              );

              return cardStyles?.visualizerUseCardBg ? (
                <CardContainer cardStyles={cardStyles} className="overflow-hidden p-4">
                  {VisualizerEl}
                </CardContainer>
              ) : (
                <div className="overflow-hidden">
                  {VisualizerEl}
                </div>
              );
            })()}

            {currentTrack && (
              <div className="text-center max-w-full overflow-hidden">
                <h2 className="text-2xl font-bold">
                  <TrackTitle text={currentTrack.title} playing={isPlaying} />
                </h2>
                {currentTrack.artist && (
                  <p
                    className="truncate"
                    style={{ color: "var(--color-text-secondary)" }}
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
                style={{ backgroundColor: "color-mix(in srgb, var(--color-accent) 20%, transparent)" }}
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
                  style={{ width: `${isDragging ? dragPercent * 100 : progress}%`, backgroundColor: "var(--color-accent)" }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full shadow-md opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer"
                  style={{
                    left: `calc(${isDragging ? dragPercent * 100 : progress}% - 8px)`,
                    backgroundColor: "var(--color-accent)",
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
              <div className="flex justify-between text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>
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
                style={{ borderRadius: borderRadiusToCSS(cardStyles?.buttonBorderRadius, 24) }}
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
                style={{
                  // Play button uses `%` units (50% = circle) instead of px so
                  // it stays circular regardless of size. The BorderRadius
                  // value's numbers are reinterpreted as percentages here.
                  borderRadius: (() => {
                    const r = cardStyles?.playButtonBorderRadius ?? 50;
                    if (typeof r === "number") return `${r}%`;
                    return `${r.tl}% ${r.tr}% ${r.br}% ${r.bl}%`;
                  })(),
                  backgroundColor: "var(--color-primary)",
                  color: "var(--color-primary-text)",
                }}
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
                style={{ borderRadius: borderRadiusToCSS(cardStyles?.buttonBorderRadius, 24) }}
              >
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                </svg>
              </button>
            </div>

            <CardContainer cardStyles={cardStyles} className="backdrop-blur p-4 max-w-full overflow-hidden">
              <h3
                id="playlist-heading"
                className="text-lg font-semibold mb-4 ml-3"
                style={{ color: cardStyles?.headingColor }}
              >
                Playlist
              </h3>
              <div className="flex flex-col" role="list" aria-labelledby="playlist-heading">
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
                        } else if (isCurrent && !isPlaying && !isLoading) {
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
                      style={{
                        backgroundColor: isCurrent
                          ? "color-mix(in srgb, var(--color-accent) 10%, transparent)"
                          : "transparent",
                      }}
                    >
                      <div className="w-6 flex items-center justify-center shrink-0" aria-hidden="true">
                        {isCurrentLoading ? (
                          <svg className="w-4 h-4 animate-spin" style={{ color: "var(--color-accent)" }} fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : isCurrentPlaying && !isHovered ? (
                          <svg className="w-4 h-4" style={{ color: "var(--color-accent)" }} fill="currentColor" viewBox="0 0 24 24">
                            <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                          </svg>
                        ) : isCurrentPlaying && isHovered ? (
                          <svg className="w-4 h-4" style={{ color: "var(--color-accent)" }} fill="currentColor" viewBox="0 0 24 24">
                            <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                          </svg>
                        ) : isHovered ? (
                          <svg className="w-4 h-4" style={{ color: cardStyles?.contentColor }} fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        ) : (
                          <span
                            className="text-[13px] md:text-sm tabular-nums"
                            style={{ color: isCurrent ? "var(--color-accent)" : cardStyles?.mutedColor }}
                          >
                            {index + 1}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <TrackTitle
                          text={track.title}
                          playing={isCurrentPlaying}
                          className="font-medium"
                          style={{
                            color: isCurrent
                              ? "var(--color-accent)"
                              : cardStyles?.contentColor,
                          }}
                        />
                        {track.artist && track.artist !== "" && (
                          <p
                            className="text-[13px] md:text-sm truncate max-w-full"
                            style={{ color: cardStyles?.mutedColor }}
                          >
                            {track.artist}
                          </p>
                        )}
                      </div>
                      {track.duration && track.duration > 0 && (
                        <span className="text-[13px] md:text-sm shrink-0" style={{ color: cardStyles?.mutedColor }}>
                          {formatTime(track.duration)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContainer>

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
