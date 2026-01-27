import type { Route } from "./+types/api.stream-mp3.$trackId";
import { getSession } from "@secretlobby/auth";
import { prisma } from "@secretlobby/db";
import { resolveTenant } from "~/lib/subdomain.server";
import { verifyPreloadToken } from "~/lib/token.server";
import { getFile } from "@secretlobby/storage";

/**
 * Fallback MP3 streaming route for legacy tracks without HLS.
 * Serves the full MP3 file with authentication.
 */
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

  // Auth: session or preload token
  const isAuthenticated =
    session.isAuthenticated && session.lobbyId === tenant.lobby.id;

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
  }

  // Origin check
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");
  const isValidOrigin = origin?.includes(host || "") || referer?.includes(host || "");

  if (!isValidOrigin && process.env.NODE_ENV === "production") {
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
    },
  });

  if (!track) {
    return new Response(null, { status: 404 });
  }

  // Fetch full MP3 from R2
  const file = await getFile(track.filename);
  if (!file) {
    return new Response(null, { status: 404 });
  }

  return new Response(file.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": file.size.toString(),
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Pragma": "no-cache",
      "Expires": "0",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
