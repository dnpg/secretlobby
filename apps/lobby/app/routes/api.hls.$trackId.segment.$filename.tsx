import type { Route } from "./+types/api.hls.$trackId.segment.$filename";
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

// Allowed filenames: init.mp4 or segment000.m4s through segment999.m4s
const VALID_FILENAME = /^(init\.mp4|segment\d{3}\.m4s)$/;

// CORS preflight from the console origin. Returns 204 for an allowed origin;
// any other method/origin gets a 405 since this is a GET-only route.
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

  const { trackId, filename } = params;
  if (!trackId || !filename) {
    return new Response(null, { status: 400 });
  }

  // Validate filename to prevent path traversal
  if (!VALID_FILENAME.test(filename)) {
    return new Response(null, { status: 400 });
  }

  // Auth: session (multi-lobby aware), preload token, or preview token bound
  // to the lobby. Preview tokens let the console page-builder fetch segments
  // cross-origin without minting a lobby session.
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

  // Origin check — bypassed for the configured console origin or when a
  // valid preview token has authorized the request.
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

  // Verify track belongs to this lobby
  const track = await prisma.track.findFirst({
    where: {
      id: trackId,
      lobbyId: tenant.lobby.id,
    },
    select: {
      id: true,
      media: { select: { key: true } },
    },
  });

  if (!track) {
    return new Response(null, { status: 404 });
  }

  // Fetch the segment file from R2
  // New path: media folder (e.g. acct/media/song-abc/{filename})
  // Legacy fallback: {lobbyId}/hls/{trackId}/{filename}
  const mediaKey = track.media?.key;
  const key = mediaKey
    ? `${getMediaFolder(mediaKey)}/${filename}`
    : `${tenant.lobby.id}/hls/${trackId}/${filename}`;
  const file = await getFile(key);
  if (!file) {
    return new Response(null, { status: 404 });
  }

  const contentType = filename.endsWith(".mp4")
    ? "video/mp4"
    : "video/iso.segment";

  const cacheHeaders: Record<string, string> = usedPreloadToken
    ? {
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        "Pragma": "no-cache",
        "Expires": "0",
      }
    : {
        "Cache-Control": "private, max-age=30",
      };

  return new Response(Buffer.from(file.body), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": file.size.toString(),
      ...cacheHeaders,
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-Robots-Tag": "noindex, nofollow",
      ...corsResponseHeaders(request),
    },
  });
}
