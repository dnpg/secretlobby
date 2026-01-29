import { useState, useEffect, useCallback, useRef, memo } from "react";
import { Form } from "react-router";
import { ResponsiveImage, PictureImage } from "@secretlobby/ui";
import { AudioVisualizer } from "~/components/AudioVisualizer";
import { WaveformProgress } from "~/components/WaveformProgress";
import { usePcmAnalyser } from "~/hooks/usePcmAnalyser";
import { SocialLinks, type SocialLinksSettings } from "~/components/SocialLinks";

/**
 * Helper function to track events in both Google Analytics (gtag) and Google Tag Manager (dataLayer)
 */
function trackEvent(eventName: string, params: Record<string, any>) {
  // Track with Google Analytics (gtag)
  if (typeof (window as any).gtag === 'function') {
    (window as any).gtag('event', eventName, params);
  }

  // Track with Google Tag Manager (dataLayer)
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
  visualizerBorderRadius: number;
  visualizerBlendMode: string;
  visualizerType: "equalizer" | "waveform";
  cardBorderRadius: number;
  buttonBorderRadius: number;
  playButtonBorderRadius: number;
}

interface CardContainerProps {
  cardStyles?: CardStyles;
  children: React.ReactNode;
  className?: string;
}

function CardContainer({ cardStyles, children, className }: CardContainerProps) {
  const radius = cardStyles?.cardBorderRadius ?? 12;
  const borderWidth = cardStyles?.borderWidth || "1px";

  const contentBg = cardStyles?.bgIsGradient
    ? { background: cardStyles.bg }
    : { backgroundColor: cardStyles?.bg || "color-mix(in srgb, var(--color-bg-secondary) 50%, transparent)" };

  if (cardStyles?.borderType === "gradient") {
    // Double-div technique for gradient borders with rounded corners
    return (
      <div
        style={{
          borderRadius: `${radius}px`,
          background: cardStyles.borderGradient,
          padding: borderWidth,
        }}
      >
        <div
          className={className}
          style={{
            borderRadius: `calc(${radius}px - ${borderWidth})`,
            ...contentBg,
          }}
        >
          {children}
        </div>
      </div>
    );
  }

  // Solid or no border: single div
  return (
    <div
      className={className}
      style={{
        borderRadius: `${radius}px`,
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
        <div className="flex justify-center overflow-hidden border-2" style={{ borderRadius: `${cardStyles?.cardBorderRadius ?? 12}px`, borderColor: "var(--color-border)" }}>
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

      {/* Social Links - Sidebar Above */}
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

      {/* Social Links - Sidebar Below */}
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
}: PlayerViewProps) {
  const { audioRef, loadTrack: loadSegmentedTrack, isLoading, isSeeking, loadingProgress, isReady, seekTo, cancelAutoPlay, estimatedDuration } = audio;

  // Find initial track: use initialTrackId if provided, otherwise first track
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
  // Ref that always has the latest track duration (avoids stale closure issues)
  const trackDurationRef = useRef(0);
  const progressBarRef = useRef<HTMLDivElement>(null);
  // Tracking refs for analytics
  const progressMilestonesRef = useRef<Set<number>>(new Set());
  const currentTrackIdRef = useRef<string | null>(null);
  const technicalInfoRef = useRef<HTMLDivElement>(null);

  // Refs for document-level mouse handlers (need stable references)
  const mouseMoveHandlerRef = useRef<((e: MouseEvent) => void) | null>(null);
  const mouseUpHandlerRef = useRef<(() => void) | null>(null);

  // Detect Safari locally — createMediaElementSource can't capture audio
  // from MSE or native HLS sources on Safari/iOS.
  const isSafari = typeof navigator !== "undefined"
    && /Safari/.test(navigator.userAgent)
    && !/Chrome/.test(navigator.userAgent);

  // PCM analyser for Safari equalizer: decodes MP3 to PCM and computes FFT.
  // Only enabled for non-HLS tracks — HLS tracks must not trigger a full MP3
  // download just for visualization. Safari + HLS falls back to waveform.
  const currentTrackHlsReady = currentTrack?.hlsReady ?? false;
  const pcmEnabled = isSafari && !currentTrackHlsReady && (cardStyles?.visualizerType ?? "equalizer") === "equalizer";
  const pcmAnalyser = usePcmAnalyser({
    enabled: pcmEnabled,
    trackId: currentTrack?.id ?? null,
    audioElement,
  });

  // On Safari with HLS tracks, fall back to waveform visualization since the
  // equalizer would require downloading the entire MP3 for PCM decoding.
  const effectiveVisualizerType = (isSafari && currentTrackHlsReady && (cardStyles?.visualizerType ?? "equalizer") === "equalizer")
    ? "waveform"
    : (cardStyles?.visualizerType ?? "equalizer");

  useEffect(() => {
    if (audioRef.current) {
      setAudioElement(audioRef.current);
    }
  }, [isReady, audioRef]);

  // Cleanup document listeners on unmount
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

  // Track clicks on custom links in WYSIWYG technical info content
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

  // Notify parent when the current track changes
  useEffect(() => {
    if (currentTrack) {
      onTrackChange?.(currentTrack.id);

      // Reset progress milestones when track changes
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

    // Total track duration (from manifest/DB, not from the partial blob)
    const totalDuration = estimatedDuration || 0;

    const updateProgress = () => {
      // Don't update progress while dragging or during seek loading
      if (totalDuration > 0 && !isDraggingRef.current && !seekLoadingRef.current) {
        const realTime = audio.currentTime;
        const progressPercent = (realTime / totalDuration) * 100;
        setCurrentTime(realTime);
        setProgress(progressPercent);

        // Track progress milestones (25%, 50%, 75%, 100%)
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
      // Always use estimatedDuration (full track) for UI, not audio.duration (partial blob)
      if (totalDuration > 0) {
        setDuration(totalDuration);
      }
    };

    const handleEnded = () => {
      // If a seek is in progress, ignore
      if (seekLoadingRef.current) return;

      // Track ended event
      trackEvent('audio_complete', {
        event_category: 'audio',
        event_label: currentTrack?.title || 'Unknown',
        track_id: currentTrack?.id,
        track_artist: currentTrack?.artist,
      });

      // Track ended: advance to next track
      onPlayingChange(false);
      playNext();
    };

    const handlePlaying = () => {
      // Audio started playing — clear seek loading state
      if (seekLoadingRef.current) {
        seekLoadingRef.current = false;
        setSeekLoading(false);
      }
    };

    const handleSeeked = () => {
      // Seek completed — clear seek loading state
      // This handles instant seeks within cached blob where 'playing' doesn't re-fire
      if (seekLoadingRef.current) {
        seekLoadingRef.current = false;
        setSeekLoading(false);
      }
    };

    const handlePlay = () => {
      onPlayingChange(true);

      // Track play event
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

        // Track pause event
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

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || seekLoadingRef.current) return;

    if (!audio.paused) {
      audio.pause();
      cancelAutoPlay(); // Cancel any pending auto-play from blob transitions

      // Track button click
      trackEvent('player_control_click', {
        event_category: 'player',
        event_label: 'pause_button',
        control: 'pause',
      });
    } else {
      audio.play().catch(() => {});

      // Track button click
      trackEvent('player_control_click', {
        event_category: 'player',
        event_label: 'play_button',
        control: 'play',
      });
    }
  };

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
        console.error("Playback failed:", e);
      }
    }
  };

  const playNext = useCallback(() => {
    if (!currentTrack) return;

    // Track button click
    trackEvent('player_control_click', {
      event_category: 'player',
      event_label: 'next_button',
      control: 'next',
    });

    const audio = audioRef.current;
    const currentIndex = tracks.findIndex(
      (t) => t.id === currentTrack.id
    );
    const nextIndex = (currentIndex + 1) % tracks.length;
    const shouldPlay = audio ? !audio.paused : true;
    playTrack(tracks[nextIndex], shouldPlay);
  }, [currentTrack, tracks]);

  const playPrev = () => {
    if (!currentTrack) return;

    // Track button click
    trackEvent('player_control_click', {
      event_category: 'player',
      event_label: 'previous_button',
      control: 'previous',
    });

    const audio = audioRef.current;

    // If paused and more than 3 seconds in, seek to beginning first
    if (audio && audio.paused && audio.currentTime > 3) {
      audio.currentTime = 0;
      setCurrentTime(0);
      setProgress(0);
      return;
    }

    const currentIndex = tracks.findIndex(
      (t) => t.id === currentTrack.id
    );
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

    // Show loading spinner and freeze the progress bar at target
    seekLoadingRef.current = true;
    setSeekLoading(true);
    setProgress(clampedPercent * 100);
    setCurrentTime(newTime);

    // Safety: clear seek loading if it takes too long (e.g., autoplay blocked on iOS)
    setTimeout(() => {
      if (seekLoadingRef.current) {
        seekLoadingRef.current = false;
        setSeekLoading(false);
      }
    }, 3000);

    // Perform the seek — the hook downloads required segment and resumes playback
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

  // Mouse drag handlers for desktop
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

    // Create handlers and store in refs for cleanup
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
    e.preventDefault(); // Prevent mouse events from firing
    setHoverPercent(null); // Clear hover tooltip
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
    e.preventDefault(); // Prevent scrolling while dragging
    const bar = progressBarRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const touch = e.touches[0];
    const percent = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    dragPercentRef.current = percent;
    setDragPercent(percent);
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault(); // Prevent mouse events from firing after touch
    setHoverPercent(null); // Clear hover tooltip
    if (!isDraggingRef.current) {
      setIsDragging(false); // Ensure dragging is cleared even if ref wasn't set
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
      className="relative min-h-screen"
      onContextMenu={import.meta.env.VITE_ENV === "development" ? undefined : (e) => e.preventDefault()}
    >
      {/* Background Image */}
      {imageUrls.background && (
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
      {/* Dark overlay */}
      <div className="fixed inset-0 -z-10 bg-black/70" />

      {/* Header */}
      <header className="container mx-auto px-4 pt-4 max-w-6xl flex justify-end items-center gap-3">
        <Form method="post" action="/logout">
          <button
            type="submit"
            className="px-4 py-2 text-sm transition"
            style={{
              borderRadius: `${cardStyles?.buttonBorderRadius ?? 24}px`,
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
      </header>

      <main className="container mx-auto px-4 py-8 max-w-6xl" style={{ color: "var(--color-text-primary)" }}>
        {/* Banner */}
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

        {/* Social Links - Above Content */}
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

        {/* Two Column Layout */}
        <div className={`grid gap-8 ${hasSidebar ? "lg:grid-cols-[1fr_300px]" : ""}`}>
          {/* Left Column - Player */}
          <div className="space-y-6">
            {/* Social Links - Above Player */}
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

            {/* Visualizer */}
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
                <AudioVisualizer {...visualizerProps} pcmAnalyser={pcmAnalyser} />
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

            {/* Track Info */}
            {currentTrack && (
              <div className="text-center">
                <h2 className="text-2xl font-bold">{currentTrack.title}</h2>
                {currentTrack.artist && (
                  <p style={{ color: "var(--color-text-secondary)" }}>{currentTrack.artist}</p>
                )}
              </div>
            )}

            {/* Progress Bar */}
            <div className="py-2 sm:py-0">
              <div
                ref={progressBarRef}
                className="group relative h-2 rounded-full cursor-pointer touch-none"
                style={{ backgroundColor: "color-mix(in srgb, var(--color-accent) 20%, transparent)" }}
                onClick={seek}
                onMouseDown={handleMouseDown}
                onMouseMove={handleProgressHover}
                onMouseLeave={handleProgressLeave}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
              >
                {/* Download progress indicator */}
                {loadingProgress > 0 && (
                  <div
                    className="absolute top-0 bottom-0 rounded-full"
                    style={{ width: `${loadingProgress}%`, backgroundColor: "color-mix(in srgb, var(--color-accent) 15%, transparent)" }}
                  />
                )}
                {/* Played progress */}
                <div
                  className="absolute top-0 bottom-0 rounded-full"
                  style={{ width: `${isDragging ? dragPercent * 100 : progress}%`, backgroundColor: "var(--color-accent)" }}
                />
                {/* Scrubber - always visible on touch devices, hover on desktop */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full shadow-md opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer"
                  style={{
                    left: `calc(${isDragging ? dragPercent * 100 : progress}% - 8px)`,
                    backgroundColor: "var(--color-accent)",
                  }}
                />
                {/* Hover tooltip */}
                {hoverPercent !== null && (duration || estimatedDuration) > 0 && (
                  <div
                    className="absolute -top-8 -translate-x-1/2 px-2 py-0.5 rounded bg-black/60 backdrop-blur-sm text-xs pointer-events-none"
                    style={{ left: `${hoverPercent * 100}%`, color: "var(--color-text-primary)" }}
                  >
                    {formatTime(hoverPercent * (duration || estimatedDuration))}
                  </div>
                )}
                {/* Drag tooltip */}
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

            {/* Controls */}
            <div className="flex justify-center items-center gap-6">
              <button
                onClick={playPrev}
                className="p-3 transition hover:opacity-80 cursor-pointer"
                style={{ borderRadius: `${cardStyles?.buttonBorderRadius ?? 24}px` }}
              >
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                </svg>
              </button>

              <button
                onClick={togglePlay}
                className="p-4 hover:scale-105 transition cursor-pointer"
                style={{
                  borderRadius: `${cardStyles?.playButtonBorderRadius ?? 50}%`,
                  backgroundColor: "var(--color-primary)",
                  color: "var(--color-primary-text)",
                }}
              >
                {isLoading || seekLoading ? (
                  <svg className="w-10 h-10 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : isPlaying ? (
                  <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                  </svg>
                ) : (
                  <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              <button
                onClick={playNext}
                className="p-3 transition hover:opacity-80 cursor-pointer"
                style={{ borderRadius: `${cardStyles?.buttonBorderRadius ?? 24}px` }}
              >
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                </svg>
              </button>
            </div>

            {/* Playlist */}
            <CardContainer cardStyles={cardStyles} className="backdrop-blur p-4">
              <h3 className="text-lg font-semibold mb-4" style={{ color: cardStyles?.headingColor }}>Playlist</h3>
              <div className="flex flex-col">
                {tracks.map((track, index) => {
                  const isCurrent = currentTrack?.id === track.id;
                  const isHovered = hoveredTrackId === track.id;
                  const isCurrentPlaying = isCurrent && isPlaying;
                  const isCurrentLoading = isCurrent && isLoading;

                  return (
                    <button
                      key={track.id}
                      onClick={() => {
                        if (isCurrentPlaying) {
                          audioRef.current?.pause();
                          onPlayingChange(false);

                          // Track track pause
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

                          // Track track resume
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

                          // Track track selection
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
                      className="w-full text-left px-3 py-2 rounded-lg transition flex items-center gap-3 group"
                      style={{
                        backgroundColor: isCurrent
                          ? "color-mix(in srgb, var(--color-accent) 10%, transparent)"
                          : "transparent",
                      }}
                    >
                      {/* Track number / play / pause indicator */}
                      <div className="w-6 flex items-center justify-center shrink-0">
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
                            className="text-sm tabular-nums"
                            style={{ color: isCurrent ? "var(--color-accent)" : cardStyles?.mutedColor }}
                          >
                            {index + 1}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className="font-medium truncate"
                          style={{ color: isCurrent ? "var(--color-accent)" : cardStyles?.contentColor }}
                        >
                          {track.title}
                        </p>
                        {track.artist && track.artist !== "" && (
                          <p className="text-sm truncate" style={{ color: cardStyles?.mutedColor }}>{track.artist}</p>
                        )}
                      </div>
                      {track.duration && track.duration > 0 && (
                        <span className="text-sm shrink-0" style={{ color: cardStyles?.mutedColor }}>
                          {formatTime(track.duration)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContainer>

            {/* Technical Info */}
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

            {/* Social Links - Below Player */}
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

          {/* Right Column - Sidebar */}
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

        {/* Social Links - Below All (Full Width) */}
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
