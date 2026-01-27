import type { Route } from "./+types/api.hls.$trackId.segment.$filename";
import { getSession } from "@secretlobby/auth";
import { prisma } from "@secretlobby/db";
import { resolveTenant } from "~/lib/subdomain.server";
import { verifyPreloadToken } from "~/lib/token.server";
import { getFile } from "@secretlobby/storage";

// Allowed filenames: init.mp4 or segment000.m4s through segment999.m4s
const VALID_FILENAME = /^(init\.mp4|segment\d{3}\.m4s)$/;

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

  // Verify track belongs to this lobby
  const track = await prisma.track.findFirst({
    where: {
      id: trackId,
      lobbyId: tenant.lobby.id,
    },
    select: { id: true },
  });

  if (!track) {
    return new Response(null, { status: 404 });
  }

  // Fetch the segment file from R2
  const key = `${tenant.lobby.id}/hls/${trackId}/${filename}`;
  const file = await getFile(key);
  if (!file) {
    return new Response(null, { status: 404 });
  }

  const contentType = filename.endsWith(".m3u8")
    ? "application/vnd.apple.mpegurl"
    : filename.endsWith(".mp4")
      ? "video/mp4"
      : "video/iso.segment";

  return new Response(file.body, {
    headers: {
      "Content-Type": contentType,
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
