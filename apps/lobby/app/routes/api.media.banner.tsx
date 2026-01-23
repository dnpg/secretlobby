import type { Route } from "./+types/api.media.banner";
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

  // Get lobby settings for banner image
  const settings = tenant.lobby.settings as Record<string, string> | null;
  let key = settings?.bannerImage || tenant.lobby.bannerImage;

  // Use dark mode image if requested and available
  if (theme === "dark" && settings?.bannerImageDark) {
    key = settings.bannerImageDark;
  }

  if (!key) {
    // Return a placeholder banner if none exists
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="50">
      <rect width="100%" height="100%" fill="#8b5cf6" rx="8"/>
      <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="white" font-family="sans-serif" font-size="16">Your Logo</text>
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
