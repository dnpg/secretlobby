import type { Route } from "./+types/api.manifest.$trackId";
import { getSession } from "@secretlobby/auth";
import { prisma } from "@secretlobby/db";
import { resolveTenant } from "~/lib/subdomain.server";
import { generateManifest } from "~/lib/segments.server";

export async function loader({ request, params }: Route.LoaderArgs) {
  // Verify session
  const { session } = await getSession(request);
  const tenant = await resolveTenant(request);

  if (!tenant.lobby) {
    return Response.json({ error: "Lobby not found" }, { status: 404 });
  }

  // Check if authenticated for this lobby
  const isAuthenticated =
    session.isAuthenticated && session.lobbyId === tenant.lobby.id;

  // If lobby requires password and not authenticated
  if (tenant.lobby.password && !isAuthenticated) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const trackId = params.trackId;
  if (!trackId) {
    return Response.json({ error: "Track ID required" }, { status: 400 });
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
  console.log("[manifest] Track filename/key:", track.filename);
  const manifest = await generateManifest(trackId, track.filename);

  if (!manifest) {
    console.error("[manifest] Failed to generate manifest for track:", trackId, "filename:", track.filename);
    return Response.json({ error: "Failed to generate manifest" }, { status: 500 });
  }

  return Response.json(manifest, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
    },
  });
}
