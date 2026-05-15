import type { Route } from "./+types/api.stream-mp3.$trackId";
import { getSession, isAuthenticatedForLobby, validatePreviewToken } from "@secretlobby/auth";
import { prisma } from "@secretlobby/db";
import { resolveTenant } from "~/lib/subdomain.server";
import { verifyPreloadToken } from "~/lib/token.server";
import { getFile } from "@secretlobby/storage";
import {
  corsResponseHeaders,
  handleCorsPreflight,
  isConsoleCrossOriginRequest,
} from "~/lib/api-cors.server";

/**
 * MP3 streaming route. Serves the full MP3 file with authentication.
 * Used as fallback when HLS playback fails (e.g. legacy MP3-in-fMP4
 * segments incompatible with the browser's MSE) or for tracks without HLS.
 */
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

  // Auth: session (multi-lobby aware), preload token, or preview token bound
  // to the lobby. Preview tokens let the console page-builder fetch this
  // file cross-origin without minting a lobby session.
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

  if (tenant.lobby.password && !isAuthenticated && !hasValidPreviewToken) {
    const preloadToken = url.searchParams.get("preload");
    if (!preloadToken) {
      return new Response(null, { status: 401 });
    }
    const preloadResult = verifyPreloadToken(preloadToken, trackId, tenant.lobby.id);
    if (!preloadResult.valid) {
      return new Response(null, { status: 401 });
    }
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

  // Find track
  const track = await prisma.track.findFirst({
    where: {
      id: trackId,
      lobbyId: tenant.lobby.id,
    },
    select: {
      filename: true,
      media: { select: { key: true } },
    },
  });

  if (!track) {
    return new Response(null, { status: 404 });
  }

  // Fetch full MP3 from R2 (prefer media key, fallback to legacy filename)
  const fileKey = track.media?.key ?? track.filename;
  const file = await getFile(fileKey);
  if (!file) {
    return new Response(null, { status: 404 });
  }

  return new Response(Buffer.from(file.body), {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": file.size.toString(),
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Pragma": "no-cache",
      "Expires": "0",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-Robots-Tag": "noindex, nofollow",
      ...corsResponseHeaders(request),
    },
  });
}
