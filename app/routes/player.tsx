import { redirect, useLoaderData, Form } from "react-router";
import { useState, useRef, useEffect, useCallback } from "react";
import type { Route } from "./+types/player";
import { getSession } from "~/lib/session.server";
import { getSiteContent, type Track } from "~/lib/content.server";
import { AudioVisualizer } from "~/components/AudioVisualizer";
import { useSegmentedAudio } from "~/hooks/useSegmentedAudio";

export function meta() {
  return [{ title: "Player" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session } = await getSession(request);
  if (!session.isAuthenticated) {
    throw redirect("/");
  }
  const content = await getSiteContent();
  return { content };
}

export default function Player() {
  const { content } = useLoaderData<typeof loader>();
  const [currentTrack, setCurrentTrack] = useState<Track | null>(
    content.playlist[0] || null
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  // Use segmented streaming (HLS-like)
  const {
    loadTrack: loadSegmentedTrack,
    isLoading,
    loadingProgress,
    isReady,
    cleanup,
  } = useSegmentedAudio(audioRef);

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  // Set audio element reference
  useEffect(() => {
    if (audioRef.current) {
      setAudioElement(audioRef.current);
    }
  }, [isReady]);

  // Load initial track
  useEffect(() => {
    if (currentTrack) {
      loadSegmentedTrack(currentTrack.id);
    }
  }, []);

  // Audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateProgress = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setCurrentTime(audio.currentTime);
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };

    const handleLoadedMetadata = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
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
  }, [isReady]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || !isReady) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch (e) {
        console.error("Playback failed:", e);
      }
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

    // Load the segmented track
    const success = await loadSegmentedTrack(track.id);

    if (success && audioRef.current) {
      // Auto-play when ready
      const tryPlay = async () => {
        try {
          await audioRef.current?.play();
          setIsPlaying(true);
        } catch (e) {
          console.error("Playback failed:", e);
        }
      };

      // Wait a bit for buffer to fill
      setTimeout(tryPlay, 300);
    }
  };

  const playNext = useCallback(() => {
    if (!currentTrack) return;
    const currentIndex = content.playlist.findIndex(
      (t) => t.id === currentTrack.id
    );
    const nextIndex = (currentIndex + 1) % content.playlist.length;
    playTrack(content.playlist[nextIndex]);
  }, [currentTrack, content.playlist]);

  const playPrev = () => {
    if (!currentTrack) return;
    const currentIndex = content.playlist.findIndex(
      (t) => t.id === currentTrack.id
    );
    const prevIndex =
      currentIndex === 0 ? content.playlist.length - 1 : currentIndex - 1;
    playTrack(content.playlist[prevIndex]);
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration || !isFinite(duration)) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * duration;

    // Only seek to buffered regions
    if (audio.buffered.length > 0) {
      audio.currentTime = newTime;
    }
  };

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-fixed"
      style={{
        backgroundImage: `linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.8)), url('/api/media/background')`,
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Header */}
      <header className="p-4 flex justify-between items-center">
        <img
          src="/api/media/banner"
          alt="Banner"
          className="h-12 object-contain"
          onContextMenu={(e) => e.preventDefault()}
          draggable={false}
        />
        <Form method="post" action="/logout">
          <button
            type="submit"
            className="px-4 py-2 text-sm bg-white/10 hover:bg-white/20 rounded-lg transition"
          >
            Logout
          </button>
        </Form>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Visualizer */}
        <div className="mb-8 rounded-xl overflow-hidden bg-gray-900/50 backdrop-blur p-4">
          <AudioVisualizer audioElement={audioElement} isPlaying={isPlaying} />
        </div>

        {/* Track Info */}
        {currentTrack && (
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold">{currentTrack.title}</h2>
            <p className="text-gray-400">{currentTrack.artist}</p>
            {isLoading && (
              <div className="mt-2">
                <div className="w-48 h-1 bg-white/20 rounded-full mx-auto overflow-hidden">
                  <div
                    className="h-full bg-purple-500 transition-all duration-300"
                    style={{ width: `${loadingProgress}%` }}
                  />
                </div>
                <p className="text-purple-400 text-xs mt-1">
                  Loading... {Math.round(loadingProgress)}%
                </p>
              </div>
            )}
          </div>
        )}

        {/* Progress Bar */}
        <div className="mb-6">
          <div
            className="h-2 bg-white/20 rounded-full cursor-pointer relative"
            onClick={seek}
          >
            {/* Buffered indicator */}
            {audioRef.current && audioRef.current.buffered.length > 0 && duration > 0 && (
              <div
                className="absolute h-full bg-white/30 rounded-full"
                style={{
                  width: `${(audioRef.current.buffered.end(audioRef.current.buffered.length - 1) / duration) * 100}%`,
                }}
              />
            )}
            {/* Progress */}
            <div
              className="absolute h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-sm text-gray-400 mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex justify-center items-center gap-6 mb-8">
          <button
            onClick={playPrev}
            className="p-3 hover:bg-white/10 rounded-full transition"
            disabled={isLoading}
          >
            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
            </svg>
          </button>

          <button
            onClick={togglePlay}
            disabled={isLoading || !isReady}
            className="p-4 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full hover:scale-105 transition disabled:opacity-50"
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
            disabled={isLoading}
          >
            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
          </button>
        </div>

        {/* Playlist */}
        <div className="bg-white/5 backdrop-blur rounded-xl p-4">
          <h3 className="text-lg font-semibold mb-4">Playlist</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {content.playlist.map((track) => (
              <button
                key={track.id}
                onClick={() => playTrack(track)}
                disabled={isLoading}
                className={`w-full text-left p-3 rounded-lg transition flex items-center gap-3 ${
                  currentTrack?.id === track.id
                    ? "bg-purple-500/30"
                    : "hover:bg-white/10"
                } ${isLoading ? "opacity-50" : ""}`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    currentTrack?.id === track.id
                      ? "bg-purple-500"
                      : "bg-white/20"
                  }`}
                >
                  {currentTrack?.id === track.id && isPlaying ? (
                    <div className="flex gap-0.5">
                      <span className="w-0.5 h-3 bg-white visualizer-bar" style={{ animationDelay: "0s" }} />
                      <span className="w-0.5 h-3 bg-white visualizer-bar" style={{ animationDelay: "0.2s" }} />
                      <span className="w-0.5 h-3 bg-white visualizer-bar" style={{ animationDelay: "0.4s" }} />
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
                  <p className="text-sm text-gray-400 truncate">{track.artist}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Audio Element (managed by MediaSource) */}
        <audio ref={audioRef} style={{ display: "none" }} />
      </main>
    </div>
  );
}
