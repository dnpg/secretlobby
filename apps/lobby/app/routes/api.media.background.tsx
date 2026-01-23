import type { Route } from "./+types/api.media.background";
import { getSession } from "@secretlobby/auth";
import { resolveTenant } from "~/lib/subdomain.server";
import { getPublicUrl } from "@secretlobby/storage";

export async function loader({ request }: Route.LoaderArgs) {
  const { session } = await getSession(request);
  const tenant = await resolveTenant(request);

  if (!tenant.lobby) {
    return new Response("Lobby not found", { status: 404 });
  }

  // Check if authenticated for this lobby
  const isAuthenticated =
    session.isAuthenticated && session.lobbyId === tenant.lobby.id;

  if (tenant.lobby.password && !isAuthenticated) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const theme = url.searchParams.get("theme");

  // Get lobby settings for background image
  const settings = tenant.lobby.settings as Record<string, string> | null;
  let key = settings?.backgroundImage || tenant.lobby.backgroundImage;

  // Use dark mode image if requested and available
  if (theme === "dark" && settings?.backgroundImageDark) {
    key = settings.backgroundImageDark;
  }

  if (!key) {
    // Return a placeholder gradient if no background exists
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#1e1b4b"/>
          <stop offset="100%" style="stop-color:#312e81"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
    </svg>`;

    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  // Redirect to CDN URL
  const cdnUrl = getPublicUrl(key);
  return new Response(null, {
    status: 302,
    headers: {
      Location: cdnUrl,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
