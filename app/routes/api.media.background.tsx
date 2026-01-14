import { readFile, stat } from "fs/promises";
import { join } from "path";
import type { Route } from "./+types/api.media.background";
import { getSession } from "~/lib/session.server";
import { getSiteContent } from "~/lib/content.server";

export async function loader({ request }: Route.LoaderArgs) {
  const { session } = await getSession(request);
  if (!session.isAuthenticated && !session.isAdmin) {
    return new Response("Unauthorized", { status: 401 });
  }

  const content = await getSiteContent();
  const filePath = join(process.cwd(), "media", "backgrounds", content.background);

  try {
    const fileStats = await stat(filePath);
    const file = await readFile(filePath);

    // Determine content type
    const ext = content.background.split(".").pop()?.toLowerCase();
    const contentTypes: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
    };

    return new Response(file, {
      headers: {
        "Content-Type": contentTypes[ext || "jpg"] || "image/jpeg",
        "Content-Length": fileStats.size.toString(),
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
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
}
