import type { Route } from "./+types/api.stream.$trackId";
import { resolveTenant } from "~/lib/subdomain.server";
import { prisma } from "@secretlobby/db";
import { getSession } from "@secretlobby/auth";
import * as fs from "fs";
import * as path from "path";

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

  // Get file path
  const mediaDir = process.env.MEDIA_DIR || path.join(process.cwd(), "media");
  const filePath = path.join(mediaDir, track.filename);

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return new Response("File not found", { status: 404 });
  }

  // Get file stats
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;

  // Handle range requests
  const range = request.headers.get("Range");
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    const fileStream = fs.createReadStream(filePath, { start, end });

    return new Response(fileStream as unknown as ReadableStream, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunkSize),
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  }

  // Full file response
  const fileStream = fs.createReadStream(filePath);

  return new Response(fileStream as unknown as ReadableStream, {
    status: 200,
    headers: {
      "Content-Length": String(fileSize),
      "Content-Type": "audio/mpeg",
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
    },
  });
}
