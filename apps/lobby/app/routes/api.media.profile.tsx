import { readFile, stat } from "fs/promises";
import { join } from "path";
import type { Route } from "./+types/api.media.profile";
import { getSession } from "@secretlobby/auth";
import { resolveTenant } from "~/lib/subdomain.server";

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
  let filename = settings?.profileImage || tenant.lobby.profileImage;

  // Use dark mode image if requested and available
  if (theme === "dark" && settings?.profileImageDark) {
    filename = settings.profileImageDark;
  }

  if (!filename) {
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

  const filePath = join(process.cwd(), "media", "profiles", filename);

  try {
    const fileStats = await stat(filePath);
    const file = await readFile(filePath);

    const ext = filename.split(".").pop()?.toLowerCase();
    const contentTypes: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
    };

    return new Response(file, {
      headers: {
        "Content-Type": contentTypes[ext || "png"] || "image/png",
        "Content-Length": fileStats.size.toString(),
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    // Return a placeholder profile pic if file not found
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
}
