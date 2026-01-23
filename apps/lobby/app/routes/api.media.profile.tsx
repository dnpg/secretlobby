import type { Route } from "./+types/api.media.profile";
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

  // Get lobby settings for profile image
  const settings = tenant.lobby.settings as Record<string, string> | null;
  let key = settings?.profileImage || tenant.lobby.profileImage;

  // Use dark mode image if requested and available
  if (theme === "dark" && settings?.profileImageDark) {
    key = settings.profileImageDark;
  }

  if (!key) {
    // Return a placeholder profile pic if none exists
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
      <rect width="100%" height="100%" fill="#374151"/>
      <circle cx="60" cy="45" r="25" fill="#6b7280"/>
      <ellipse cx="60" cy="110" rx="40" ry="35" fill="#6b7280"/>
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
