import { prisma, type Account, type Lobby } from "@secretlobby/db";
import { validatePreviewToken } from "@secretlobby/auth";

/**
 * Check if the request is from localhost (development mode)
 */
export function isLocalhost(request: Request): boolean {
  const url = new URL(request.url);
  const hostname = request.headers.get("host") || url.hostname;
  const hostWithoutPort = hostname.split(":")[0];
  return hostWithoutPort === "localhost" || hostWithoutPort === "127.0.0.1";
}

export interface TenantContext {
  account: Account | null;
  lobby: Lobby | null;
  subdomain: string | null;
  lobbySlug: string | null;
  isCustomDomain: boolean;
  isPreview: boolean;
}

/**
 * Get the actual hostname from the request.
 * Handles Traefik/proxy headers (X-Forwarded-Host) and direct host header.
 */
function getHostname(request: Request): string {
  const url = new URL(request.url);

  // Debug logging
  console.log("[subdomain] === Request Headers ===");
  console.log("[subdomain] X-Forwarded-Host:", request.headers.get("X-Forwarded-Host"));
  console.log("[subdomain] X-Forwarded-Proto:", request.headers.get("X-Forwarded-Proto"));
  console.log("[subdomain] X-Subdomain:", request.headers.get("X-Subdomain"));
  console.log("[subdomain] Host:", request.headers.get("host"));
  console.log("[subdomain] URL hostname:", url.hostname);
  console.log("[subdomain] Full URL:", request.url);
  console.log("[subdomain] CORE_DOMAIN env:", process.env.CORE_DOMAIN);

  // Check for proxy forwarded host (Traefik, nginx, etc.)
  const forwardedHost = request.headers.get("X-Forwarded-Host");
  if (forwardedHost) {
    console.log("[subdomain] Using X-Forwarded-Host:", forwardedHost);
    return forwardedHost.split(":")[0];
  }

  // Fall back to host header or URL hostname
  const hostname = request.headers.get("host") || url.hostname;
  console.log("[subdomain] Using fallback hostname:", hostname);
  return hostname.split(":")[0];
}

/**
 * Extract subdomain from the request hostname.
 * Handles Traefik (X-Forwarded-Host) and nginx (X-Subdomain) headers.
 */
export function extractSubdomain(request: Request): string | null {
  // First check for explicitly forwarded subdomain header (nginx)
  const forwardedSubdomain = request.headers.get("X-Subdomain");
  if (forwardedSubdomain) {
    console.log("[subdomain] Found X-Subdomain header:", forwardedSubdomain);
    return forwardedSubdomain;
  }

  // Parse from hostname (handles Traefik X-Forwarded-Host)
  const hostWithoutPort = getHostname(request);

  // Use CORE_DOMAIN from environment
  const appDomain = process.env.CORE_DOMAIN;
  if (!appDomain) {
    throw new Error("CORE_DOMAIN environment variable must be set");
  }

  console.log("[subdomain] Checking if", hostWithoutPort, "ends with", `.${appDomain}`);

  // Check if this is a subdomain of our app domain
  if (hostWithoutPort.endsWith(`.${appDomain}`)) {
    const subdomain = hostWithoutPort.replace(`.${appDomain}`, "");
    console.log("[subdomain] Extracted subdomain:", subdomain);
    // Ignore www and empty subdomains
    if (subdomain && subdomain !== "www") {
      return subdomain;
    }
  }

  console.log("[subdomain] No subdomain found");
  return null;
}

/**
 * Check if the hostname is a custom domain (not our app domain)
 */
export function isCustomDomain(request: Request): boolean {
  const hostWithoutPort = getHostname(request);

  // Use CORE_DOMAIN from environment
  const appDomain = process.env.CORE_DOMAIN;
  if (!appDomain) {
    throw new Error("CORE_DOMAIN environment variable must be set");
  }

  return (
    !hostWithoutPort.endsWith(`.${appDomain}`) &&
    hostWithoutPort !== appDomain &&
    hostWithoutPort !== `www.${appDomain}` &&
    hostWithoutPort !== "localhost"
  );
}