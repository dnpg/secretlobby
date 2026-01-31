/**
 * Debug endpoint to view and manage rate limits
 * ONLY AVAILABLE IN DEVELOPMENT
 *
 * GET /api/debug/rate-limits - View current rate limit state
 * POST /api/debug/rate-limits - Clear all rate limits
 */

import type { Route } from "./+types/api.debug.rate-limits";

export async function loader({ request }: Route.LoaderArgs) {
  // Only allow in development
  if (process.env.NODE_ENV !== "development") {
    return new Response("Not found", { status: 404 });
  }

  const { getRateLimitStatus, getClientIp, getRateLimitBackend } = await import(
    "@secretlobby/auth/rate-limit"
  );

  const clientIp = getClientIp(request);
  const backend = getRateLimitBackend();
  const status = await getRateLimitStatus(clientIp);

  return Response.json({
    clientIp,
    backend,
    message: `Rate limiting using ${backend}`,
    rateLimits: status,
    hint: "POST to this endpoint to clear all rate limits",
  });
}

export async function action({ request }: Route.ActionArgs) {
  // Only allow in development
  if (process.env.NODE_ENV !== "development") {
    return new Response("Not found", { status: 404 });
  }

  const { clearAllRateLimits, getClientIp, getRateLimitBackend } = await import(
    "@secretlobby/auth/rate-limit"
  );

  const clientIp = getClientIp(request);
  const backend = getRateLimitBackend();
  const cleared = await clearAllRateLimits();

  return Response.json({
    clientIp,
    backend,
    message: `Cleared ${cleared} rate limit entries from ${backend}`,
    cleared,
    success: true,
  });
}
