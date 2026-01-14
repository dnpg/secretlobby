import { open, stat } from "fs/promises";
import { join } from "path";
import type { Route } from "./+types/api.stream.$trackId";
import { getSession } from "~/lib/session.server";
import { verifyStreamToken } from "~/lib/token.server";
import { getSiteContent } from "~/lib/content.server";

// Maximum chunk size: 64KB - small chunks make reassembly harder
const MAX_CHUNK_SIZE = 64 * 1024;

// XOR key for obfuscation (makes data unrecognizable as audio)
const XOR_KEY = [0x5A, 0x3C, 0x9F, 0x1E, 0x7B, 0xD2, 0x48, 0xA6];

function obfuscateData(data: Buffer): Buffer {
  const result = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ XOR_KEY[i % XOR_KEY.length];
  }
  return result;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  // 1. Verify session
  const { session } = await getSession(request);
  if (!session.isAuthenticated && !session.isAdmin) {
    return new Response(null, { status: 401 });
  }

  const trackId = params.trackId;
  if (!trackId) {
    return new Response(null, { status: 404 });
  }

  // 2. Verify token from query string
  const url = new URL(request.url);
  const token = url.searchParams.get("t");

  if (!token) {
    return new Response(null, { status: 403 });
  }

  const tokenResult = verifyStreamToken(token, trackId);
  if (!tokenResult.valid) {
    return new Response(null, { status: 403 });
  }

  // 3. Check origin/referer (anti-hotlinking)
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");

  const isValidOrigin =
    origin?.includes(host || "") || referer?.includes(host || "");

  if (!isValidOrigin && process.env.NODE_ENV === "production") {
    return new Response(null, { status: 403 });
  }

  // 4. Find the track by ID (obfuscated - no filename in URL)
  const content = await getSiteContent();
  const track = content.playlist.find((t) => t.id === trackId);

  if (!track) {
    return new Response(null, { status: 404 });
  }

  const filePath = join(process.cwd(), "media", "audio", track.filename);

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
      const requestedEnd = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      end = Math.min(start + MAX_CHUNK_SIZE - 1, requestedEnd, fileSize - 1);
    }

    if (start >= fileSize || start < 0) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${fileSize}` },
      });
    }

    const chunkSize = end - start + 1;

    // Read only the chunk we need
    const fileHandle = await open(filePath, "r");
    const buffer = Buffer.alloc(chunkSize);
    await fileHandle.read(buffer, 0, chunkSize, start);
    await fileHandle.close();

    // XOR obfuscate the data - browser won't recognize it as audio
    const obfuscatedBuffer = obfuscateData(buffer);

    return new Response(new Uint8Array(obfuscatedBuffer), {
      status: 206,
      headers: {
        // Generic binary type - not recognizable as audio
        "Content-Type": "application/octet-stream",
        "Content-Length": chunkSize.toString(),
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        // Aggressive anti-caching
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        "Pragma": "no-cache",
        "Expires": "0",
        // Security headers
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
        "X-Frame-Options": "DENY",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
