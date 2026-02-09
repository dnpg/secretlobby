import type { Route } from "./+types/api.hls.$trackId.playlist";
import { getSession, isAuthenticatedForLobby } from "@secretlobby/auth";
import { prisma } from "@secretlobby/db";
import { resolveTenant } from "~/lib/subdomain.server";
import { verifyPreloadToken } from "~/lib/token.server";
import { getFile, getMediaFolder } from "@secretlobby/storage";

export async function loader({ request, params }: Route.LoaderArgs) {
  const { session } = await getSession(request);
  const tenant = await resolveTenant(request);

  if (!tenant.lobby) {
    return new Response(null, { status: 404 });
  }

  const trackId = params.trackId;
  if (!trackId) {
    return new Response(null, { status: 400 });
  }

  // Auth: session (multi-lobby aware) or preload token
  const isAuthenticated = isAuthenticatedForLobby(session, tenant.lobby.id);

  let usedPreloadToken = false;
  if (tenant.lobby.password && !isAuthenticated) {
    const url = new URL(request.url);
    const preloadToken = url.searchParams.get("preload");
    if (!preloadToken) {
      return new Response(null, { status: 401 });
    }
    const preloadResult = verifyPreloadToken(preloadToken, trackId, tenant.lobby.id);
    if (!preloadResult.valid) {
      return new Response(null, { status: 401 });
    }
    usedPreloadToken = true;
  }

  // Origin check
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");
  const isValidOrigin = origin?.includes(host || "") || referer?.includes(host || "");

  if (!isValidOrigin && process.env.NODE_ENV === "production") {
    return new Response(null, { status: 403 });
  }

  // Find track (must belong to this lobby and have HLS ready)
  const track = await prisma.track.findFirst({
    where: {
      id: trackId,
      lobbyId: tenant.lobby.id,
    },
    select: {
      id: true,
      hlsReady: true,
      media: { select: { key: true, hlsReady: true } },
    },
  });

  const hlsReady = track?.media?.hlsReady ?? track?.hlsReady ?? false;
  if (!track || !hlsReady) {
    return new Response(null, { status: 404 });
  }

  // Fetch the m3u8 playlist from R2
  // New path: media folder (e.g. acct/media/song-abc/playlist.m3u8)
  // Legacy fallback: {lobbyId}/hls/{trackId}/playlist.m3u8
  const mediaKey = track.media?.key;
  const key = mediaKey
    ? `${getMediaFolder(mediaKey)}/playlist.m3u8`
    : `${tenant.lobby.id}/hls/${trackId}/playlist.m3u8`;
  const file = await getFile(key);
  if (!file) {
    return new Response(null, { status: 404 });
  }

  // Rewrite segment URLs to point through our authenticated route
  // The m3u8 contains relative paths like "init.mp4" and "segment000.m4s"
  // We rewrite them to "/api/hls/{trackId}/segment/{filename}?preload=..."
  const url = new URL(request.url);
  const preloadParam = url.searchParams.get("preload");
  const preloadQuery = preloadParam ? `?preload=${encodeURIComponent(preloadParam)}` : "";

  let playlist = new TextDecoder().decode(file.body);

  // Rewrite init segment URI
  playlist = playlist.replace(
    /^#EXT-X-MAP:URI="([^"]+)"/gm,
    (_, filename) => `#EXT-X-MAP:URI="/api/hls/${trackId}/segment/${filename}${preloadQuery}"`
  );

  // Rewrite segment filenames (lines that aren't comments)
  playlist = playlist.replace(
    /^(segment\d{3}\.m4s)$/gm,
    (_, filename) => `/api/hls/${trackId}/segment/${filename}${preloadQuery}`
  );

  // Also rewrite init.mp4 if it appears as a standalone line
  playlist = playlist.replace(
    /^(init\.mp4)$/gm,
    (_, filename) => `/api/hls/${trackId}/segment/${filename}${preloadQuery}`
  );

  const cacheHeaders = usedPreloadToken
    ? {
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        "Pragma": "no-cache",
        "Expires": "0",
      }
    : {
        "Cache-Control": "private, max-age=60",
      };

  return new Response(playlist, {
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl",
      ...cacheHeaders,
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
