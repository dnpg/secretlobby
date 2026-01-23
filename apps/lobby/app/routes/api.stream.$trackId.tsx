import type { Route } from "./+types/api.stream.$trackId";
import { resolveTenant } from "~/lib/subdomain.server";
import { prisma } from "@secretlobby/db";
import { getSession } from "@secretlobby/auth";
import { getPublicUrl } from "@secretlobby/storage";

export async function loader({ request, params }: Route.LoaderArgs) {
  const { trackId } = params;

  if (!trackId) {
    return new Response("Track ID required", { status: 400 });
  }

  // Resolve tenant
  const tenant = await resolveTenant(request);
  if (!tenant.lobby) {
    return new Response("Lobby not found", { status: 404 });
  }

  // Check authentication if password protected
  if (tenant.lobby.password) {
    const { session } = await getSession(request);
    if (!session.isAuthenticated || session.lobbyId !== tenant.lobby.id) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  // Find track
  const track = await prisma.track.findFirst({
    where: {
      id: trackId,
      lobbyId: tenant.lobby.id,
    },
  });

  if (!track) {
    return new Response("Track not found", { status: 404 });
  }

  // Redirect to CDN URL — Cloudflare handles range requests natively
  const cdnUrl = getPublicUrl(track.filename);
  return new Response(null, {
    status: 302,
    headers: {
      Location: cdnUrl,
      "Cache-Control": "no-store",
    },
  });
}
