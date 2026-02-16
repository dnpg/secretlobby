import { prisma, type Account, type Lobby } from "@secretlobby/db";
import { validatePreviewToken } from "@secretlobby/auth";

/** Cookie name for persisting preview token across navigation (e.g. after password submit) */
export const PREVIEW_COOKIE_NAME = "preview_token";

const PREVIEW_COOKIE_MAX_AGE = 60 * 60; // 1 hour, match token expiry

function parseCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp("(^|;\\s*)" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$0") + "=([^;]*)"));
  return match ? decodeURIComponent(match[2].trim()) : null;
}

/**
 * Build Set-Cookie header value to persist preview token (call when URL has ?preview=token).
 */
export function getPreviewCookieHeader(token: string): string {
  const isProd = process.env.NODE_ENV === "production";
  return [
    `${PREVIEW_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${PREVIEW_COOKIE_MAX_AGE}`,
    "SameSite=Lax",
    ...(isProd ? ["Secure"] : []),
  ].join("; ");
}

/**
 * Build Set-Cookie header value to clear the preview cookie (exit preview).
 */
export function getClearPreviewCookieHeader(): string {
  const isProd = process.env.NODE_ENV === "production";
  return [
    `${PREVIEW_COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "SameSite=Lax",
    ...(isProd ? ["Secure"] : []),
  ].join("; ");
}

/**
 * Extract and validate preview token from the request (URL first, then cookie).
 * Cookie allows preview to persist across navigation (e.g. after password submit).
 * Returns the validated token info if valid, null otherwise.
 */
function getPreviewToken(request: Request): { lobbyId: string; accountId: string } | null {
  const url = new URL(request.url);
  const fromUrl = url.searchParams.get("preview");
  if (fromUrl) {
    const info = validatePreviewToken(fromUrl);
    if (info) return info;
  }
  const fromCookie = parseCookie(request.headers.get("Cookie"), PREVIEW_COOKIE_NAME);
  if (fromCookie) return validatePreviewToken(fromCookie);
  return null;
}

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
  const appDomain = process.env.CORE_DOMAIN || "secretlobby.co";

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
  const appDomain = process.env.CORE_DOMAIN || "secretlobby.co";

  return (
    !hostWithoutPort.endsWith(`.${appDomain}`) &&
    hostWithoutPort !== appDomain &&
    hostWithoutPort !== `www.${appDomain}` &&
    hostWithoutPort !== "localhost"
  );
}

/**
 * Extract a potential lobby slug from the URL path.
 * URLs like /my-lobby or /my-lobby/page become lobby slug "my-lobby"
 */
function extractLobbySlugFromPath(request: Request): string | null {
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/").filter(Boolean);

  // First path segment could be a lobby slug
  if (pathParts.length > 0) {
    const potentialSlug = pathParts[0];
    // Exclude known routes that aren't lobby slugs
    const excludedPaths = ["api", "assets", "favicon.ico", "robots.txt", "sitemap.xml"];
    if (!excludedPaths.includes(potentialSlug)) {
      return potentialSlug;
    }
  }

  return null;
}

/**
 * Resolve the tenant (account + lobby) from the request.
 * Used in loaders to filter data by band_id.
 *
 * URL structure:
 * - {account}.secretlobby.co → default lobby
 * - {account}.secretlobby.co/{lobbySlug} → specific lobby
 * - custom-domain.com → lobby assigned to that domain
 * - custom-domain.com/{lobbySlug} → specific lobby on custom domain
 *
 * Preview mode:
 * - If ?preview={token} is present, validates the token and allows viewing unpublished lobbies
 */
export async function resolveTenant(request: Request): Promise<TenantContext> {
  const subdomain = extractSubdomain(request);
  const customDomain = isCustomDomain(request);
  const lobbySlugFromPath = extractLobbySlugFromPath(request);
  const previewTokenInfo = getPreviewToken(request);

  console.log("[subdomain] Subdomain:", subdomain);
  console.log("[subdomain] Custom domain:", customDomain);
  console.log("[subdomain] Lobby slug from path:", lobbySlugFromPath);
  console.log("[subdomain] Preview token valid:", !!previewTokenInfo);

  // Try subdomain resolution first
  if (subdomain) {
    const account = await prisma.account.findUnique({
      where: { slug: subdomain },
      select: {
        id: true,
        name: true,
        slug: true,
        subscriptionTier: true,
        stripeCustomerId: true,
        settings: true,
        defaultLobbyId: true,
        createdAt: true,
        updatedAt: true,
        lobbies: {
          select: {
            id: true,
            name: true,
            slug: true,
            password: true,
            isDefault: true,
            isPublished: true,
            accountId: true,
            settings: true,
            title: true,
            description: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (account) {
      // Find the correct lobby based on path or default
      let lobby = null;
      let isPreview = false;

      if (lobbySlugFromPath) {
        // Try to find lobby by slug
        lobby = account.lobbies.find((l) => l.slug === lobbySlugFromPath) || null;
      }

      // Fall back to default lobby if no path-based lobby found
      if (!lobby) {
        lobby = account.lobbies.find((l) => l.isDefault) || account.lobbies[0] || null;
      }

      // Check if lobby is accessible
      if (lobby) {
        // If lobby is unpublished, check for valid preview token
        if (!lobby.isPublished) {
          if (previewTokenInfo && previewTokenInfo.lobbyId === lobby.id && previewTokenInfo.accountId === account.id) {
            // Valid preview token - allow access
            isPreview = true;
            console.log("[subdomain] Preview mode enabled for lobby:", lobby.id);
          } else {
            // No valid preview token - deny access to unpublished lobby
            console.log("[subdomain] Lobby is unpublished and no valid preview token");
            lobby = null;
          }
        }
      }

      return {
        account: account as any,
        lobby: lobby || null,
        subdomain,
        lobbySlug: lobbySlugFromPath,
        isCustomDomain: false,
        isPreview,
      };
    }
  }

  // Try custom domain resolution
  if (customDomain) {
    const hostname = getHostname(request);

    const domain = await prisma.domain.findUnique({
      where: {
        domain: hostname,
        status: "VERIFIED",
      },
      select: {
        id: true,
        domain: true,
        status: true,
        lobbyId: true, // Check for per-lobby domain
        account: {
          select: {
            id: true,
            name: true,
            slug: true,
            subscriptionTier: true,
            stripeCustomerId: true,
            settings: true,
            defaultLobbyId: true,
            createdAt: true,
            updatedAt: true,
            lobbies: {
              select: {
                id: true,
                name: true,
                slug: true,
                password: true,
                isDefault: true,
                isPublished: true,
                accountId: true,
                settings: true,
                title: true,
                description: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    });

    if (domain?.account) {
      // Find the correct lobby
      let lobby = null;
      let isPreview = false;

      // If domain is assigned to a specific lobby, use that
      if (domain.lobbyId) {
        lobby = domain.account.lobbies.find((l) => l.id === domain.lobbyId) || null;
      }

      // Otherwise check path-based slug
      if (!lobby && lobbySlugFromPath) {
        lobby = domain.account.lobbies.find((l) => l.slug === lobbySlugFromPath) || null;
      }

      // Fall back to default lobby
      if (!lobby) {
        lobby = domain.account.lobbies.find((l) => l.isDefault) || domain.account.lobbies[0] || null;
      }

      // Check if lobby is accessible
      if (lobby) {
        // If lobby is unpublished, check for valid preview token
        if (!lobby.isPublished) {
          if (previewTokenInfo && previewTokenInfo.lobbyId === lobby.id && previewTokenInfo.accountId === domain.account.id) {
            // Valid preview token - allow access
            isPreview = true;
            console.log("[subdomain] Preview mode enabled for lobby:", lobby.id);
          } else {
            // No valid preview token - deny access to unpublished lobby
            console.log("[subdomain] Lobby is unpublished and no valid preview token");
            lobby = null;
          }
        }
      }

      return {
        account: domain.account as any,
        lobby: lobby || null,
        subdomain: null,
        lobbySlug: lobbySlugFromPath,
        isCustomDomain: true,
        isPreview,
      };
    }
  }

  return {
    account: null,
    lobby: null,
    subdomain,
    lobbySlug: lobbySlugFromPath,
    isCustomDomain: customDomain,
    isPreview: false,
  };
}

/**
 * Require a valid tenant or throw a 404 response.
 */
export async function requireTenant(request: Request): Promise<{
  account: Account;
  lobby: Lobby;
  subdomain: string | null;
  lobbySlug: string | null;
  isCustomDomain: boolean;
  isPreview: boolean;
}> {
  const tenant = await resolveTenant(request);

  if (!tenant.account) {
    throw new Response("Band not found", { status: 404 });
  }

  if (!tenant.lobby) {
    throw new Response("Lobby not found", { status: 404 });
  }

  return {
    account: tenant.account,
    lobby: tenant.lobby,
    subdomain: tenant.subdomain,
    lobbySlug: tenant.lobbySlug,
    isCustomDomain: tenant.isCustomDomain,
    isPreview: tenant.isPreview,
  };
}
