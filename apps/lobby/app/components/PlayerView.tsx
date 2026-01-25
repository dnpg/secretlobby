import { useState, useEffect, useCallback, useRef, memo } from "react";
import { Form } from "react-router";
import { ResponsiveImage, PictureImage } from "@secretlobby/ui";
import { AudioVisualizer } from "~/components/AudioVisualizer";
import { SocialLinks, type SocialLinksSettings } from "~/components/SocialLinks";

export interface Track {
  id: string;
  title: string;
  artist?: string | null;
  filename?: string;
  duration?: number | null;
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
  loadTrack: (trackId: string, preloadToken?: string) => Promise<boolean>;
  isLoading: boolean;
  isSeeking: boolean;
  loadingProgress: number;
  isReady: boolean;
  seekTo: (time: number) => Promise<void>;
  estimatedDuration: number;
  isAllSegmentsCached: boolean;
  blobTimeOffset: number;
  blobHasLastSegment: boolean;
  isBlobMode: boolean;
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
  return (
    <div className="space-y-6">
      {imageUrls.profile && (
        <div className="flex justify-center overflow-hidden border-2" style={{ borderRadius: `${cardStyles?.cardBorderRadius ?? 12}px`, borderColor: "var(--color-border)" }}>
          {imageUrls.profileDark ? (
            <PictureImage
              sources={[
                { media: "(prefers-color-scheme: dark)", src: imageUrls.profileDark, widths: [300, 600] },
              ]}
              fallback={{ src: imageUrls.profile, widths: [300, 600] }}
              alt={bandName || "Profile"}
              className="w-full object-cover"
            />
          ) : (
            <ResponsiveImage
              src={imageUrls.profile}
              alt={bandName || "Profile"}
              widths={[300, 600]}
              className="w-full object-cover"
            />
          )}
        </div>
      )}

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

      {socialLinksSettings && socialLinksSettings.links.length > 0 && (
        <CardContainer cardStyles={cardStyles} className="backdrop-blur p-4">
          <SocialLinks settings={socialLinksSettings} />
        </CardContainer>
      )}
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
  cardStyles?: CardStyles;
  socialLinksSettings?: SocialLinksSettings | null;
  technicalInfo?: TechnicalInfo | null;
}

export function PlayerView({
  tracks,
  imageUrls,
  bandName,
  bandDescription,
  audio,
  isPlaying,
  onPlayingChange,
  cardStyles,
  socialLinksSettings,
  technicalInfo,
}: PlayerViewProps) {
  const { audioRef, loadTrack: loadSegmentedTrack, isLoading, isSeeking, loadingProgress, isReady, seekTo, estimatedDuration, isAllSegmentsCached, blobTimeOffset, blobHasLastSegment, isBlobMode } = audio;

  const [currentTrack, setCurrentTrack] = useState<Track | null>(
    tracks[0] || null
  );
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
  const progressBarRef = useRef<HTMLDivElement>(null);

  // Refs for document-level mouse handlers (need stable references)
  const mouseMoveHandlerRef = useRef<((e: MouseEvent) => void) | null>(null);
  const mouseUpHandlerRef = useRef<(() => void) | null>(null);

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

  useEffect(() => {
    if (estimatedDuration > 0 && !isFinite(duration)) {
      setDuration(estimatedDuration);
    }
  }, [estimatedDuration]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Total track duration (from manifest/DB, not from the partial blob)
    const totalDuration = estimatedDuration || 0;

    const updateProgress = () => {
      // Don't update progress while dragging or during seek loading
      // This keeps the scrubber at the target position until seek completes
      if (totalDuration > 0 && !isDraggingRef.current && !seekLoadingRef.current) {
        const realTime = audio.currentTime + blobTimeOffset;
        setCurrentTime(realTime);
        setProgress((realTime / totalDuration) * 100);
      }
    };

    const handleLoadedMetadata = () => {
      // Always use estimatedDuration (full track) for UI, not audio.duration (partial blob)
      if (totalDuration > 0) {
        setDuration(totalDuration);
      }
    };

    const handleEnded = () => {
      // If a seek is actively loading, ignore — the seek will handle playback
      if (seekLoadingRef.current) return;

      if (isBlobMode) {
        // BLOB MODE: Check if the blob includes the last segment
        const realTime = audio.currentTime + blobTimeOffset;

        if (!blobHasLastSegment) {
          // Partial blob ended — extend by seeking slightly past current position
          seekTo(realTime + 0.2);
          return;
        }

        // Blob has last segment — verify we're actually near the track's end
        if (totalDuration > 0 && realTime < totalDuration - 2) {
          return;
        }
      }
      // MSE MODE or track truly ended: advance to next track
      onPlayingChange(false);
      playNext();
    };

    const handlePlaying = () => {
      // Audio started playing — clear seek loading state
      if (seekLoadingRef.current) {
        console.log("[handlePlaying] clearing seekLoading");
        seekLoadingRef.current = false;
        setSeekLoading(false);
      }
    };

    const handlePlay = () => onPlayingChange(true);
    const handlePause = () => {
      // Don't report pause if we're in the middle of a seek (blob swap causes pause)
      if (!seekLoadingRef.current) {
        onPlayingChange(false);
      }
    };

    audio.addEventListener("timeupdate", updateProgress);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("playing", handlePlaying);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);

    return () => {
      audio.removeEventListener("timeupdate", updateProgress);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
    };
  }, [estimatedDuration, blobTimeOffset, blobHasLastSegment, isBlobMode, audioRef]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || seekLoadingRef.current) return;

    if (!audio.paused) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
  };

  const playTrack = async (track: Track) => {
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

    const success = await loadSegmentedTrack(track.id);

    if (success && audioRef.current) {
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
    const currentIndex = tracks.findIndex(
      (t) => t.id === currentTrack.id
    );
    const nextIndex = (currentIndex + 1) % tracks.length;
    playTrack(tracks[nextIndex]);
  }, [currentTrack, tracks]);

  const playPrev = () => {
    if (!currentTrack) return;
    const currentIndex = tracks.findIndex(
      (t) => t.id === currentTrack.id
    );
    const prevIndex =
      currentIndex === 0 ? tracks.length - 1 : currentIndex - 1;
    playTrack(tracks[prevIndex]);
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
    }, 10000);

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

        {/* Two Column Layout */}
        <div className={`grid gap-8 ${hasSidebar ? "lg:grid-cols-[1fr_300px]" : ""}`}>
          {/* Left Column - Player */}
          <div className="space-y-6">
            {/* Visualizer */}
            {cardStyles?.visualizerUseCardBg ? (
              <CardContainer cardStyles={cardStyles} className="overflow-hidden p-4">
                <AudioVisualizer
                  audioElement={audioElement}
                  isPlaying={isPlaying}
                  borderShow={cardStyles?.visualizerBorderShow}
                  borderColor={cardStyles?.visualizerBorderColor}
                  borderRadius={cardStyles?.visualizerBorderRadius}
                  blendMode={cardStyles?.visualizerBlendMode}
                />
              </CardContainer>
            ) : (
              <div className="overflow-hidden">
                <AudioVisualizer
                  audioElement={audioElement}
                  isPlaying={isPlaying}
                  borderShow={cardStyles?.visualizerBorderShow}
                  borderColor={cardStyles?.visualizerBorderColor}
                  borderRadius={cardStyles?.visualizerBorderRadius}
                  blendMode={cardStyles?.visualizerBlendMode}
                />
              </div>
            )}

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
                        } else if (isCurrent && !isPlaying && !isLoading) {
                          audioRef.current?.play().then(() => onPlayingChange(true)).catch(() => {});
                        } else {
                          playTrack(track);
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
                    className="text-sm prose-content"
                    style={{ color: cardStyles?.contentColor }}
                    dangerouslySetInnerHTML={{ __html: technicalInfo.content }}
                  />
                )}
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
      </main>
    </div>
  );
}
