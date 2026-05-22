import type { Route } from "./+types/api.hls.$trackId.playlist";
import { getSession, isAuthenticatedForLobby, validatePreviewToken } from "@secretlobby/auth";
import { prisma } from "@secretlobby/db";
import { resolveTenant } from "~/lib/subdomain.server";
import { verifyPreloadToken } from "~/lib/token.server";
import { getFile, getMediaFolder } from "@secretlobby/storage";
import {
  corsResponseHeaders,
  handleCorsPreflight,
  isConsoleCrossOriginRequest,
} from "~/lib/api-cors.server";

// CORS preflight from the console origin. Returns 204 for an allowed origin
// or null otherwise — when null, react-router responds with 405 which is the
// correct rejection for browsers that aren't the console.
export async function action({ request }: Route.ActionArgs) {
  if (request.method === "OPTIONS") {
    const preflight = handleCorsPreflight(request);
    if (preflight) return preflight;
  }
  return new Response(null, { status: 405 });
}

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

  // Auth: session (multi-lobby aware), preload token, or — for cross-origin
  // requests from the console page-builder — a preview token bound to the
  // lobby/account. We treat a valid preview token as equivalent to the lobby
  // session: it satisfies the password gate and bypasses the same-host
  // origin check (which always fails for legitimate cross-origin callers).
  const isAuthenticated = isAuthenticatedForLobby(session, tenant.lobby.id);

  const url = new URL(request.url);
  const previewTokenParam = url.searchParams.get("preview");
  const previewTokenInfo = previewTokenParam
    ? validatePreviewToken(previewTokenParam)
    : null;
  const hasValidPreviewToken =
    !!previewTokenInfo &&
    previewTokenInfo.lobbyId === tenant.lobby.id &&
    previewTokenInfo.accountId === tenant.lobby.accountId;

  let usedPreloadToken = false;
  if (tenant.lobby.password && !isAuthenticated && !hasValidPreviewToken) {
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

  // Origin check — bypassed when the caller is the configured console
  // origin (CORS allow-listed) or when a valid preview token has authorized
  // the request. Otherwise enforce same-host in production.
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");
  const isValidOrigin = origin?.includes(host || "") || referer?.includes(host || "");
  const isConsoleCors = isConsoleCrossOriginRequest(request);

  if (
    !isValidOrigin &&
    !isConsoleCors &&
    !hasValidPreviewToken &&
    process.env.NODE_ENV === "production"
  ) {
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

  // Rewrite segment URLs to point through our authenticated route. The m3u8
  // contains relative paths like "init.mp4" and "segment000.m4s"; we rewrite
  // them to absolute paths under /api/hls/.../segment/... and re-attach any
  // preload OR preview token from the request URL so the segment fetches
  // satisfy the same auth gate as this playlist request.
  const preloadParam = url.searchParams.get("preload");
  const queryParts: string[] = [];
  if (preloadParam) {
    queryParts.push(`preload=${encodeURIComponent(preloadParam)}`);
  }
  if (previewTokenParam) {
    queryParts.push(`preview=${encodeURIComponent(previewTokenParam)}`);
  }
  const propagatedQuery = queryParts.length ? `?${queryParts.join("&")}` : "";

  let playlist = new TextDecoder().decode(file.body);

  // Rewrite init segment URI
  playlist = playlist.replace(
    /^#EXT-X-MAP:URI="([^"]+)"/gm,
    (_, filename) => `#EXT-X-MAP:URI="/api/hls/${trackId}/segment/${filename}${propagatedQuery}"`
  );

  // Rewrite segment filenames (lines that aren't comments)
  playlist = playlist.replace(
    /^(segment\d{3}\.m4s)$/gm,
    (_, filename) => `/api/hls/${trackId}/segment/${filename}${propagatedQuery}`
  );

  // Also rewrite init.mp4 if it appears as a standalone line
  playlist = playlist.replace(
    /^(init\.mp4)$/gm,
    (_, filename) => `/api/hls/${trackId}/segment/${filename}${propagatedQuery}`
  );

  const cacheHeaders: Record<string, string> = usedPreloadToken
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
      ...corsResponseHeaders(request),
    },
  });
}
