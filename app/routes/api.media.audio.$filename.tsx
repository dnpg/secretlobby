import { open, stat } from "fs/promises";
import { join } from "path";
import type { Route } from "./+types/api.media.audio.$filename";
import { getSession } from "~/lib/session.server";
import { verifyStreamToken } from "~/lib/token.server";

// Maximum chunk size: 128KB - forces multiple requests for full file
const MAX_CHUNK_SIZE = 128 * 1024;

export async function loader({ request, params }: Route.LoaderArgs) {
  // 1. Verify session
  const { session } = await getSession(request);
  if (!session.isAuthenticated && !session.isAdmin) {
    return new Response("Unauthorized", { status: 401 });
  }

  const filename = params.filename;
  if (!filename) {
    return new Response("Not Found", { status: 404 });
  }

  // 2. Verify token from query string
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return new Response("Token required", { status: 403 });
  }

  const tokenResult = verifyStreamToken(token, filename);
  if (!tokenResult.valid) {
    return new Response(`Invalid token: ${tokenResult.error}`, { status: 403 });
  }

  // 3. Check origin/referer (anti-hotlinking)
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");

  const isValidOrigin =
    origin?.includes(host || "") || referer?.includes(host || "");

  if (!isValidOrigin && process.env.NODE_ENV === "production") {
    return new Response("Forbidden", { status: 403 });
  }

  // 4. Sanitize filename to prevent directory traversal
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "");
  const filePath = join(process.cwd(), "media", "audio", sanitizedFilename);

  try {
    const fileStats = await stat(filePath);
    const fileSize = fileStats.size;

    // Handle range requests
    const range = request.headers.get("range");

    let start = 0;
    let end = Math.min(MAX_CHUNK_SIZE - 1, fileSize - 1);

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      start = parseInt(parts[0], 10) || 0;

      // Limit the end to MAX_CHUNK_SIZE from start
      const requestedEnd = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      end = Math.min(start + MAX_CHUNK_SIZE - 1, requestedEnd, fileSize - 1);
    }

    // Ensure valid range
    if (start >= fileSize || start < 0) {
      return new Response("Range Not Satisfiable", {
        status: 416,
        headers: {
          "Content-Range": `bytes */${fileSize}`,
        },
      });
    }

    const chunkSize = end - start + 1;

    // Read only the chunk we need (more memory efficient)
    const fileHandle = await open(filePath, "r");
    const buffer = Buffer.alloc(chunkSize);
    await fileHandle.read(buffer, 0, chunkSize, start);
    await fileHandle.close();

    // Always return 206 Partial Content to indicate chunked streaming
    return new Response(buffer, {
      status: 206,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": chunkSize.toString(),
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        // Aggressive anti-caching
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
        // Security headers
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline", // Prevent download prompt
        // Prevent embedding in other sites
        "X-Frame-Options": "SAMEORIGIN",
        "Content-Security-Policy": "default-src 'self'",
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
