import type { Route } from "./+types/api.manifest.$trackId";
import { getSession } from "@secretlobby/auth";
import { prisma } from "@secretlobby/db";
import { resolveTenant } from "~/lib/subdomain.server";
import { generateManifest } from "~/lib/segments.server";
import { verifyPreloadToken } from "~/lib/token.server";

export async function loader({ request, params }: Route.LoaderArgs) {
  // Verify session
  const { session } = await getSession(request);
  const tenant = await resolveTenant(request);

  if (!tenant.lobby) {
    return Response.json({ error: "Lobby not found" }, { status: 404 });
  }

  const trackId = params.trackId;
  if (!trackId) {
    return Response.json({ error: "Track ID required" }, { status: 400 });
  }

  // Check if authenticated for this lobby (session or preload token)
  const isAuthenticated =
    session.isAuthenticated && session.lobbyId === tenant.lobby.id;

  if (tenant.lobby.password && !isAuthenticated) {
    // Check for preload token as alternative auth
    const url = new URL(request.url);
    const preloadToken = url.searchParams.get("preload");
    if (!preloadToken) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const preloadResult = verifyPreloadToken(preloadToken, trackId, tenant.lobby.id);
    if (!preloadResult.valid) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Check origin
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");
  const isValidOrigin = origin?.includes(host || "") || referer?.includes(host || "");

  if (!isValidOrigin && process.env.NODE_ENV === "production") {
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  }

  // Find track (must belong to this lobby)
  const track = await prisma.track.findFirst({
    where: {
      id: trackId,
      lobbyId: tenant.lobby.id,
    },
    select: {
      id: true,
      filename: true,
    },
  });

  if (!track) {
    return Response.json({ error: "Track not found" }, { status: 404 });
  }

  // Generate manifest with segment tokens
  const manifest = await generateManifest(trackId, track.filename);

  if (!manifest) {
    return Response.json({ error: "Failed to generate manifest" }, { status: 500 });
  }

  return Response.json(manifest, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Pragma": "no-cache",
      "Expires": "0",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
