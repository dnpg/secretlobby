import type { Route } from "./+types/api.clear-rate-limit.$ipAddress";

/**
 * API endpoint to clear in-memory rate limits for a specific IP
 * Called by super-admin when unblocking an IP
 */
export async function loader({ params, request }: Route.LoaderArgs) {
  const { clearInMemoryRateLimitsForIP } = await import("@secretlobby/auth/rate-limit");

  // Security: Only allow requests from localhost or with a secret token
  const authHeader = request.headers.get("authorization");
  const secretToken = process.env.ADMIN_API_SECRET || "dev-secret-token";

  if (authHeader !== `Bearer ${secretToken}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const ipAddress = params.ipAddress;

  // Clear in-memory rate limits for this IP
  clearInMemoryRateLimitsForIP(ipAddress);

  return new Response(
    JSON.stringify({ success: true, message: `Cleared in-memory rate limits for ${ipAddress}` }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}
