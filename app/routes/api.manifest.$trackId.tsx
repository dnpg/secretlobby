import type { Route } from "./+types/api.manifest.$trackId";
import { getSession } from "~/lib/session.server";
import { getSiteContent } from "~/lib/content.server";
import { generateManifest } from "~/lib/segments.server";

export async function loader({ request, params }: Route.LoaderArgs) {
  // Verify session
  const { session } = await getSession(request);
  if (!session.isAuthenticated && !session.isAdmin) {
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

  // Find track
  const content = await getSiteContent();
  const track = content.playlist.find((t) => t.id === trackId);

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
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
    },
  });
}
