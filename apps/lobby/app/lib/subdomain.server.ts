import { prisma, type Account, type Lobby } from "@secretlobby/db";

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
  isCustomDomain: boolean;
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
  const appDomain = process.env.CORE_DOMAIN || "secretlobby.io";

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
  const appDomain = process.env.CORE_DOMAIN || "secretlobby.io";

  return (
    !hostWithoutPort.endsWith(`.${appDomain}`) &&
    hostWithoutPort !== appDomain &&
    hostWithoutPort !== `www.${appDomain}` &&
    hostWithoutPort !== "localhost"
  );
}

/**
 * Resolve the tenant (account + lobby) from the request.
 * Used in loaders to filter data by band_id.
 */
export async function resolveTenant(request: Request): Promise<TenantContext> {
  const subdomain = extractSubdomain(request);
  const customDomain = isCustomDomain(request);
  console.log('the dsub',subdomain);
  console.log('the custom',customDomain);
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
          where: { isDefault: true },
          take: 1,
          select: {
            id: true,
            name: true,
            slug: true,
            password: true,
            isDefault: true,
            accountId: true,
            settings: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (account) {
      return {
        account: account as any, // Type cast needed due to select vs full type
        lobby: account.lobbies[0] || null,
        subdomain,
        isCustomDomain: false,
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
              where: { isDefault: true },
              take: 1,
              select: {
                id: true,
                name: true,
                slug: true,
                password: true,
                isDefault: true,
                accountId: true,
                settings: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    });

    if (domain?.account) {
      return {
        account: domain.account as any, // Type cast needed due to select vs full type
        lobby: domain.account.lobbies[0] || null,
        subdomain: null,
        isCustomDomain: true,
      };
    }
  }

  return {
    account: null,
    lobby: null,
    subdomain,
    isCustomDomain: customDomain,
  };
}

/**
 * Require a valid tenant or throw a 404 response.
 */
export async function requireTenant(request: Request): Promise<{
  account: Account;
  lobby: Lobby;
  subdomain: string | null;
  isCustomDomain: boolean;
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
    isCustomDomain: tenant.isCustomDomain,
  };
}
