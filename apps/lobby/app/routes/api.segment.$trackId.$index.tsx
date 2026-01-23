import type { Route } from "./+types/api.segment.$trackId.$index";
import { getSession } from "@secretlobby/auth";
import { prisma } from "@secretlobby/db";
import { resolveTenant } from "~/lib/subdomain.server";
import { verifyStreamToken, verifyPreloadToken } from "~/lib/token.server";
import { getSegmentSize } from "~/lib/segments.server";
import { getFileRange, getFileInfo } from "@secretlobby/storage";

export async function loader({ request, params }: Route.LoaderArgs) {
  // Verify session
  const { session } = await getSession(request);
  const tenant = await resolveTenant(request);

  if (!tenant.lobby) {
    return new Response(null, { status: 404 });
  }

  // Check if authenticated for this lobby (session or preload token)
  const isAuthenticated =
    session.isAuthenticated && session.lobbyId === tenant.lobby.id;

  if (tenant.lobby.password && !isAuthenticated) {
    // Check for preload token as alternative auth
    const url = new URL(request.url);
    const preloadToken = url.searchParams.get("preload");
    const { trackId: pTrackId } = params;
    if (!preloadToken || !pTrackId) {
      return new Response(null, { status: 401 });
    }
    const preloadResult = verifyPreloadToken(preloadToken, pTrackId, tenant.lobby.id);
    if (!preloadResult.valid) {
      return new Response(null, { status: 401 });
    }
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

  // Find track (must belong to this lobby)
  const track = await prisma.track.findFirst({
    where: {
      id: trackId,
      lobbyId: tenant.lobby.id,
    },
    select: {
      filename: true,
    },
  });

  if (!track) {
    return new Response(null, { status: 404 });
  }

  try {
    // Get file size from R2
    const fileInfo = await getFileInfo(track.filename);
    if (!fileInfo) {
      return new Response(null, { status: 404 });
    }

    const totalSize = fileInfo.size;
    const segmentSize = getSegmentSize();

    // Calculate segment boundaries
    const start = segmentIndex * segmentSize;
    const end = Math.min(start + segmentSize - 1, totalSize - 1);

    if (start >= totalSize) {
      return new Response(null, { status: 404 });
    }

    const chunkSize = end - start + 1;

    // Fetch segment from R2
    const rangeData = await getFileRange(track.filename, start, end);
    if (!rangeData) {
      return new Response(null, { status: 404 });
    }

    return new Response(rangeData.body, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": chunkSize.toString(),
        "Content-Disposition": "inline",
        // Anti-caching: prevent browser/proxy from storing segments
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        "Pragma": "no-cache",
        "Expires": "0",
        // Security
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
