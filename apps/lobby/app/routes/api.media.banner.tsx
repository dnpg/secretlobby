import { readFile, stat } from "fs/promises";
import { join } from "path";
import type { Route } from "./+types/api.media.banner";
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

  // Get lobby settings for banner image
  const settings = tenant.lobby.settings as Record<string, string> | null;
  let filename = settings?.bannerImage || tenant.lobby.bannerImage;

  // Use dark mode image if requested and available
  if (theme === "dark" && settings?.bannerImageDark) {
    filename = settings.bannerImageDark;
  }

  if (!filename) {
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

  const filePath = join(process.cwd(), "media", "banners", filename);

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
    // Return a placeholder banner if file not found
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
}
