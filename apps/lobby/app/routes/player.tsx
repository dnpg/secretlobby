import { redirect, useLoaderData, Form } from "react-router";
import { useState, useRef, useEffect, useCallback } from "react";
import type { Route } from "./+types/player";
import { getSession } from "@secretlobby/auth";
import { resolveTenant, isLocalhost } from "~/lib/subdomain.server";
import { getSiteContent, type Track as FileTrack } from "~/lib/content.server";
import { prisma } from "@secretlobby/db";
import { AudioVisualizer } from "~/components/AudioVisualizer";
import { useSegmentedAudio } from "~/hooks/useSegmentedAudio";

export function meta({ data }: Route.MetaArgs) {
  const title = data?.content?.bandName || data?.lobby?.title || data?.account?.name || "Player";
  return [{ title }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session } = await getSession(request);

  // Handle localhost development mode
  if (isLocalhost(request)) {
    if (!session.isAuthenticated) {
      throw redirect("/");
    }
    const content = await getSiteContent();
    return {
      isLocalhost: true,
      content,
      lobby: null,
      account: null,
      tracks: content.playlist,
    };
  }

  // Handle multi-tenant mode
  const tenant = await resolveTenant(request);

  if (!tenant.account || !tenant.lobby) {
    throw redirect("/");
  }

  const { account, lobby } = tenant;

  // Check authentication
  const isAuthenticated =
    session.isAuthenticated && session.lobbyId === lobby.id;

  // If password required and not authenticated, redirect to home
  if (lobby.password && !isAuthenticated) {
    throw redirect("/");
  }

  // Fetch tracks
  const tracks = await prisma.track.findMany({
    where: { lobbyId: lobby.id },
    orderBy: { position: "asc" },
    select: {
      id: true,
      title: true,
      artist: true,
      duration: true,
      position: true,
      filename: true,
    },
  });

  return {
    isLocalhost: false,
    content: null,
    lobby: {
      id: lobby.id,
      title: lobby.title,
      description: lobby.description,
      backgroundImage: lobby.backgroundImage,
      bannerImage: lobby.bannerImage,
      profileImage: lobby.profileImage,
    },
    account: {
      name: account.name,
      slug: account.slug,
    },
    tracks,
  };
}

interface Track {
  id: string;
  title: string;
  artist?: string | null;
  filename?: string;
  duration?: number | null;
}

export default function Player() {
  const data = useLoaderData<typeof loader>();
  const { isLocalhost, content, lobby, account } = data;

  // Normalize tracks to common interface
  const tracks: Track[] = isLocalhost
    ? (content?.playlist || []).map((t: FileTrack) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        filename: t.filename,
      }))
    : data.tracks;

  const [currentTrack, setCurrentTrack] = useState<Track | null>(
    tracks[0] || null
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [hoverPercent, setHoverPercent] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  const {
    loadTrack: loadSegmentedTrack,
    isLoading,
    loadingProgress,
    isReady,
    cleanup,
    seekTo,
    estimatedDuration,
  } = useSegmentedAudio(audioRef);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  useEffect(() => {
    if (audioRef.current) {
      setAudioElement(audioRef.current);
    }
  }, [isReady]);

  useEffect(() => {
    if (currentTrack) {
      loadSegmentedTrack(currentTrack.id);
    }
  }, []);

  // Use estimatedDuration from hook as fallback when audio.duration is Infinity
  useEffect(() => {
    if (estimatedDuration > 0 && !isFinite(duration)) {
      setDuration(estimatedDuration);
    }
  }, [estimatedDuration]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const getEffectiveDuration = () => {
      if (audio.duration && isFinite(audio.duration)) {
        return audio.duration;
      }
      return estimatedDuration || 0;
    };

    const updateProgress = () => {
      const effectiveDuration = getEffectiveDuration();
      if (effectiveDuration > 0) {
        setCurrentTime(audio.currentTime);
        setProgress((audio.currentTime / effectiveDuration) * 100);
      }
    };

    const handleLoadedMetadata = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      } else if (estimatedDuration > 0) {
        setDuration(estimatedDuration);
      }
    };

    const handleDurationChange = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      playNext();
    };

    audio.addEventListener("timeupdate", updateProgress);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("durationchange", handleDurationChange);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", updateProgress);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [isReady, estimatedDuration]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const playTrack = async (track: Track) => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
    }

    setCurrentTrack(track);
    setIsPlaying(false);
    setProgress(0);
    setCurrentTime(0);
    setDuration(0);

    const success = await loadSegmentedTrack(track.id);

    if (success && audioRef.current) {
      const tryPlay = async () => {
        try {
          await audioRef.current?.play();
          setIsPlaying(true);
        } catch (e) {
          console.error("Playback failed:", e);
        }
      };
      setTimeout(tryPlay, 300);
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

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const effectiveDuration = duration || estimatedDuration;
    if (!audio || !effectiveDuration || effectiveDuration <= 0) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = percent * effectiveDuration;

    // Fire and forget - never block user interaction
    seekTo(newTime);

    // Always start playing on timeline click
    if (!isPlaying) {
      audio.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleProgressHover = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverPercent(percent);
  };

  const handleProgressLeave = () => {
    setHoverPercent(null);
  };

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const hasSidebar = isLocalhost
    ? content?.profilePic || content?.bandDescription
    : lobby?.profileImage || lobby?.description;

  const bandName = isLocalhost ? content?.bandName : (lobby?.title || account?.name);
  const bandDescription = isLocalhost ? content?.bandDescription : lobby?.description;

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-fixed"
      style={{
        backgroundImage: `linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.8)), url('/api/media/background')`,
      }}
      onContextMenu={import.meta.env.VITE_ENV === "development" ? undefined : (e) => e.preventDefault()}
    >
      {/* Header */}
      <header className="container mx-auto px-4 pt-4 max-w-6xl flex justify-end items-center gap-3">
        <Form method="post" action="/logout">
          <button
            type="submit"
            className="px-4 py-2 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition"
          >
            Logout
          </button>
        </Form>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-6xl text-white">
        {/* Banner */}
        <div className="mb-8">
          <img
            src="/api/media/banner"
            alt="Banner"
            className="w-full h-auto object-contain rounded-xl"
            onContextMenu={import.meta.env.VITE_ENV === "development" ? undefined : (e) => e.preventDefault()}
            draggable={false}
          />
        </div>

        {/* Two Column Layout */}
        <div className={`grid gap-8 ${hasSidebar ? "lg:grid-cols-[1fr_300px]" : ""}`}>
          {/* Left Column - Player */}
          <div className="space-y-6">
            {/* Visualizer */}
            <div className="rounded-xl overflow-hidden bg-gray-800/50 backdrop-blur p-4">
              <AudioVisualizer audioElement={audioElement} isPlaying={isPlaying} />
            </div>

            {/* Track Info */}
            {currentTrack && (
              <div className="text-center">
                <h2 className="text-2xl font-bold">{currentTrack.title}</h2>
                {currentTrack.artist && (
                  <p className="text-gray-400">{currentTrack.artist}</p>
                )}
              </div>
            )}

            {/* Progress Bar */}
            <div>
              <div
                className="group relative h-2 bg-white/20 rounded-full cursor-pointer"
                onClick={seek}
                onMouseMove={handleProgressHover}
                onMouseLeave={handleProgressLeave}
              >
                {/* Download progress indicator */}
                {loadingProgress > 0 && (
                  <div
                    className="absolute top-0 bottom-0 bg-white/15 rounded-full"
                    style={{ width: `${loadingProgress}%` }}
                  />
                )}
                {/* Played progress */}
                <div
                  className="absolute top-0 bottom-0 bg-white rounded-full"
                  style={{ width: `${progress}%` }}
                />
                {/* Position ball */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ left: `calc(${progress}% - 6px)` }}
                />
                {/* Hover tooltip */}
                {hoverPercent !== null && (duration || estimatedDuration) > 0 && (
                  <div
                    className="absolute -top-8 -translate-x-1/2 px-2 py-0.5 rounded bg-black/60 backdrop-blur-sm text-white text-xs pointer-events-none"
                    style={{ left: `${hoverPercent * 100}%` }}
                  >
                    {formatTime(hoverPercent * (duration || estimatedDuration))}
                  </div>
                )}
              </div>
              <div className="flex justify-between text-sm text-gray-400 mt-1">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration || estimatedDuration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex justify-center items-center gap-6">
              <button
                onClick={playPrev}
                className="p-3 hover:bg-white/10 rounded-full transition"

              >
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                </svg>
              </button>

              <button
                onClick={togglePlay}
                className="p-4 bg-white text-gray-900 rounded-full hover:scale-105 transition"
              >
                {isLoading ? (
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
                className="p-3 hover:bg-white/10 rounded-full transition"

              >
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                </svg>
              </button>
            </div>

            {/* Playlist */}
            <div className="bg-gray-800/50 backdrop-blur rounded-xl p-4">
              <h3 className="text-lg font-semibold mb-4">Playlist</h3>
              <div className="space-y-2">
                {tracks.map((track) => (
                  <button
                    key={track.id}
                    onClick={() => playTrack(track)}
    
                    className={`w-full text-left p-3 rounded-lg transition flex items-center gap-3 ${
                      currentTrack?.id === track.id
                        ? "bg-white/20"
                        : "hover:bg-white/10"
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        currentTrack?.id === track.id
                          ? "bg-white text-gray-900"
                          : "bg-gray-700"
                      }`}
                    >
                      {currentTrack?.id === track.id && isPlaying ? (
                        <div className="flex gap-0.5">
                          <span className="w-0.5 h-3 bg-gray-900 animate-pulse" style={{ animationDelay: "0s" }} />
                          <span className="w-0.5 h-3 bg-gray-900 animate-pulse" style={{ animationDelay: "0.2s" }} />
                          <span className="w-0.5 h-3 bg-gray-900 animate-pulse" style={{ animationDelay: "0.4s" }} />
                        </div>
                      ) : currentTrack?.id === track.id && isLoading ? (
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{track.title}</p>
                      {track.artist && (
                        <p className="text-sm text-gray-400 truncate">{track.artist}</p>
                      )}
                    </div>
                    {track.duration && track.duration > 0 && (
                      <span className="text-sm text-gray-500 flex-shrink-0">
                        {formatTime(track.duration)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column - Sidebar */}
          {hasSidebar && (
            <div className="space-y-6">
              {/* Profile Image */}
              {(isLocalhost ? content?.profilePic : lobby?.profileImage) && (
                <div className="flex justify-center">
                  <img
                    src="/api/media/profile"
                    alt={bandName || "Profile"}
                    className="w-full rounded-xl object-cover border-2 border-gray-700"
                    onContextMenu={import.meta.env.VITE_ENV === "development" ? undefined : (e) => e.preventDefault()}
                    draggable={false}
                  />
                </div>
              )}

              {/* Band Info */}
              {(bandName || bandDescription) && (
                <div className="bg-gray-800/50 backdrop-blur rounded-xl p-4 border border-gray-700">
                  {bandName && (
                    <h3 className="text-lg font-semibold mb-2">
                      {bandName}
                    </h3>
                  )}
                  {bandDescription && (
                    <p className="text-gray-400 text-sm whitespace-pre-wrap">
                      {bandDescription}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Audio Element */}
        <audio ref={audioRef} style={{ display: "none" }} />
      </main>
    </div>
  );
}
