import { useRef, useState, useEffect } from "react";
import { Form, useLoaderData, useActionData } from "react-router";
import type { Route } from "./+types/_index";
import { resolveTenant, isLocalhost } from "~/lib/subdomain.server";
import { prisma } from "@secretlobby/db";
import { getSession, createSessionResponse } from "@secretlobby/auth";
import { getSiteContent, getSitePassword, type Track as FileTrack } from "~/lib/content.server";
import { getPublicUrl } from "@secretlobby/storage";
import { generatePreloadToken } from "~/lib/token.server";
import { PlayerView, type Track, type ImageUrls } from "~/components/PlayerView";
import { useSegmentedAudio } from "~/hooks/useSegmentedAudio";

export function meta({ data }: Route.MetaArgs) {
  const title = data?.lobby?.title || data?.account?.name || data?.content?.bandName || "SecretLobby";
  return [
    { title },
    { name: "description", content: data?.lobby?.description || "Private music lobby" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session } = await getSession(request);

  // Handle localhost development mode
  if (isLocalhost(request)) {
    const content = await getSiteContent();
    const isAuthenticated = session.isAuthenticated;

    return {
      isLocalhost: true,
      content,
      lobby: null,
      account: null,
      requiresPassword: !isAuthenticated,
      isAuthenticated,
      imageUrls: {
        background: null,
        backgroundDark: null,
        banner: null,
        bannerDark: null,
        profile: null,
        profileDark: null,
      } satisfies ImageUrls,
      tracks: isAuthenticated ? content.playlist : [],
      preloadTrackId: null,
      preloadToken: null,
      notFound: false,
    };
  }

  // Resolve tenant from subdomain or custom domain
  const tenant = await resolveTenant(request);

  // If no tenant found, show a generic landing
  if (!tenant.account || !tenant.lobby) {
    return {
      isLocalhost: false,
      content: null,
      lobby: null,
      account: null,
      requiresPassword: false,
      isAuthenticated: false,
      imageUrls: {
        background: null,
        backgroundDark: null,
        banner: null,
        bannerDark: null,
        profile: null,
        profileDark: null,
      } satisfies ImageUrls,
      tracks: [],
      preloadTrackId: null,
      preloadToken: null,
      notFound: true,
    };
  }

  const { account, lobby } = tenant;
  const settings = lobby.settings as Record<string, string> | null;

  // Check if lobby requires password and user is authenticated
  const isAuthenticated =
    session.isAuthenticated && session.lobbyId === lobby.id;

  const needsPassword = !!lobby.password && !isAuthenticated;

  // Compute image URLs
  const imageUrls: ImageUrls = {
    background: lobby.backgroundImage ? getPublicUrl(lobby.backgroundImage) : null,
    backgroundDark: settings?.backgroundImageDark ? getPublicUrl(settings.backgroundImageDark) : null,
    banner: lobby.bannerImage ? getPublicUrl(lobby.bannerImage) : null,
    bannerDark: settings?.bannerImageDark ? getPublicUrl(settings.bannerImageDark) : null,
    profile: lobby.profileImage ? getPublicUrl(lobby.profileImage) : null,
    profileDark: settings?.profileImageDark ? getPublicUrl(settings.profileImageDark) : null,
  };

  // Fetch tracks only if authenticated (but get first track ID for preloading)
  let preloadTrackId: string | null = null;
  let preloadToken: string | null = null;

  const tracks = needsPassword
    ? []
    : await prisma.track.findMany({
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

  // If password required, find first track for preloading
  if (needsPassword) {
    const firstTrack = await prisma.track.findFirst({
      where: { lobbyId: lobby.id },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    if (firstTrack) {
      preloadTrackId = firstTrack.id;
      preloadToken = generatePreloadToken(firstTrack.id, lobby.id);
    }
  }

  return {
    isLocalhost: false,
    content: null,
    lobby: {
      id: lobby.id,
      title: lobby.title,
      description: lobby.description,
    },
    account: {
      name: account.name,
      slug: account.slug,
    },
    requiresPassword: needsPassword,
    isAuthenticated: !needsPassword,
    imageUrls,
    tracks,
    preloadTrackId,
    preloadToken,
    notFound: false,
  };
}

export async function action({ request }: Route.ActionArgs) {
  // Handle localhost development mode
  if (isLocalhost(request)) {
    const formData = await request.formData();
    const password = formData.get("password") as string;
    const sitePassword = await getSitePassword();

    if (password === sitePassword) {
      return createSessionResponse({ isAuthenticated: true }, request, "/");
    }
    return { error: "Invalid password" };
  }

  const tenant = await resolveTenant(request);

  if (!tenant.lobby) {
    return { error: "Lobby not found" };
  }

  const formData = await request.formData();
  const password = formData.get("password") as string;

  // Verify password
  if (password !== tenant.lobby.password) {
    return { error: "Invalid password" };
  }

  // Create authenticated session for this lobby
  return createSessionResponse(
    {
      isAuthenticated: true,
      lobbyId: tenant.lobby.id,
    },
    request,
    "/"
  );
}

export default function LobbyIndex() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  // Audio state lives here so it persists across login → player transition
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioHook = useSegmentedAudio(audioRef);
  const [isPlaying, setIsPlaying] = useState(false);
  const loadedTrackRef = useRef<string | null>(null);
  const wasAuthenticatedRef = useRef(!data.requiresPassword);

  // Resolve tracks for both localhost and multi-tenant
  const tracks: Track[] = data.isLocalhost
    ? (data.content?.playlist || []).map((t: FileTrack) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        filename: t.filename,
      }))
    : data.tracks;

  // Stop audio on logout (authenticated → unauthenticated transition)
  useEffect(() => {
    if (data.requiresPassword && wasAuthenticatedRef.current) {
      audioRef.current?.pause();
      audioHook.cleanup();
      setIsPlaying(false);
      loadedTrackRef.current = null;
    }
    wasAuthenticatedRef.current = !data.requiresPassword;
  }, [data.requiresPassword]);

  // Preload the first track on the password page (before authentication)
  useEffect(() => {
    if (data.requiresPassword && data.preloadTrackId && data.preloadToken && !loadedTrackRef.current) {
      loadedTrackRef.current = data.preloadTrackId;
      audioHook.loadTrack(data.preloadTrackId, data.preloadToken);
    }
  }, [data.requiresPassword, data.preloadTrackId, data.preloadToken]);

  // After login: continue downloading remaining segments or load from scratch
  const firstTrackId = tracks[0]?.id;
  useEffect(() => {
    if (!firstTrackId || data.requiresPassword) return;

    if (loadedTrackRef.current === firstTrackId) {
      // Track was preloaded — resume full download with session auth
      audioHook.continueDownload();
    } else {
      // No preload — load from scratch
      loadedTrackRef.current = firstTrackId;
      audioHook.loadTrack(firstTrackId);
    }
  }, [firstTrackId, data.requiresPassword]);

  // Auto-play when the first track becomes ready and user is authenticated
  useEffect(() => {
    if (audioHook.isReady && !data.requiresPassword && !isPlaying) {
      audioRef.current?.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  }, [audioHook.isReady, data.requiresPassword]);

  // Not found state
  if (data.notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Lobby Not Found</h1>
          <p className="text-gray-400">
            This lobby doesn't exist or hasn't been set up yet.
          </p>
        </div>
      </div>
    );
  }

  const { lobby, account, requiresPassword, isLocalhost, content, imageUrls } = data;

  // Password required state
  if (requiresPassword) {
    const title = isLocalhost
      ? (content?.bandName || "Private Access")
      : (lobby?.title || account?.name || "Private Lobby");
    const description = isLocalhost
      ? content?.bandDescription
      : lobby?.description;

    return (
      <>
        <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
          <div className="w-full max-w-md p-8">
            <div className="bg-gray-800 rounded-2xl p-8 shadow-2xl border border-gray-700">
              <div className="text-center mb-8">
                <div
                  className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-600 flex items-center justify-center"
                >
                  <svg
                    className="w-8 h-8 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                </div>
                <h1 className="text-2xl font-bold">
                  {title}
                </h1>
                {description && (
                  <p className="text-gray-400 mt-2">{description}</p>
                )}
              </div>

              {actionData?.error && (
                <div className="mb-6 text-red-400 text-sm text-center bg-red-500/10 py-3 px-4 rounded-lg">
                  {actionData.error}
                </div>
              )}

              <Form method="post" className="space-y-4">
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    placeholder="Enter the password"
                    required
                    autoFocus
                    className="w-full px-4 py-3 rounded-lg bg-gray-700 border border-gray-600 text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-3 px-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Enter Lobby
                </button>
              </Form>
            </div>
          </div>
        </div>
        {/* Audio element persists even on login page */}
        <audio ref={audioRef} style={{ display: "none" }} />
      </>
    );
  }

  // Authenticated state - show player
  const bandName = isLocalhost ? content?.bandName : (lobby?.title || account?.name);
  const bandDescription = isLocalhost ? content?.bandDescription : lobby?.description;

  return (
    <>
      <PlayerView
        tracks={tracks}
        imageUrls={imageUrls}
        bandName={bandName}
        bandDescription={bandDescription}
        audio={{
          audioRef,
          loadTrack: audioHook.loadTrack,
          isLoading: audioHook.isLoading,
          loadingProgress: audioHook.loadingProgress,
          isReady: audioHook.isReady,
          seekTo: audioHook.seekTo,
          estimatedDuration: audioHook.estimatedDuration,
        }}
        isPlaying={isPlaying}
        onPlayingChange={setIsPlaying}
      />
      {/* Audio element */}
      <audio ref={audioRef} style={{ display: "none" }} />
    </>
  );
}
