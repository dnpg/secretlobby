import { open, stat } from "fs/promises";
import { join } from "path";
import type { Route } from "./+types/api.segment.$trackId.$index";
import { getSession } from "~/lib/session.server";
import { verifyStreamToken } from "~/lib/token.server";
import { getSiteContent } from "~/lib/content.server";
import { getSegmentSize } from "~/lib/segments.server";

export async function loader({ request, params }: Route.LoaderArgs) {
  // Verify session
  const { session } = await getSession(request);
  if (!session.isAuthenticated && !session.isAdmin) {
    return new Response(null, { status: 401 });
  }

  const { trackId, index } = params;
  if (!trackId || index === undefined) {
    return new Response(null, { status: 404 });
  }

  const segmentIndex = parseInt(index, 10);
  if (isNaN(segmentIndex) || segmentIndex < 0) {
    return new Response(null, { status: 400 });
  }

  // Verify token (token is for trackId:index combination)
  const url = new URL(request.url);
  const token = url.searchParams.get("t");

  if (!token) {
    return new Response(null, { status: 403 });
  }

  const tokenResult = verifyStreamToken(token, `${trackId}:${segmentIndex}`);
  if (!tokenResult.valid) {
    return new Response(null, { status: 403 });
  }

  // Check origin
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");
  const isValidOrigin = origin?.includes(host || "") || referer?.includes(host || "");

  if (!isValidOrigin && process.env.NODE_ENV === "production") {
    return new Response(null, { status: 403 });
  }

  // Find track
  const content = await getSiteContent();
  const track = content.playlist.find((t) => t.id === trackId);

  if (!track) {
    return new Response(null, { status: 404 });
  }

  const filePath = join(process.cwd(), "media", "audio", track.filename);

  try {
    const fileStats = await stat(filePath);
    const totalSize = fileStats.size;
    const segmentSize = getSegmentSize();

    // Calculate segment boundaries
    const start = segmentIndex * segmentSize;
    const end = Math.min(start + segmentSize - 1, totalSize - 1);

    if (start >= totalSize) {
      return new Response(null, { status: 404 });
    }

    const chunkSize = end - start + 1;

    // Read segment
    const fileHandle = await open(filePath, "r");
    const buffer = Buffer.alloc(chunkSize);
    await fileHandle.read(buffer, 0, chunkSize, start);
    await fileHandle.close();

    // Return segment as audio (needed for MediaSource)
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": chunkSize.toString(),
        "X-Segment-Index": segmentIndex.toString(),
        "X-Segment-Start": start.toString(),
        "X-Segment-End": end.toString(),
        "X-Total-Size": totalSize.toString(),
        // Anti-caching
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        "Pragma": "no-cache",
        "Expires": "0",
        // Security
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
