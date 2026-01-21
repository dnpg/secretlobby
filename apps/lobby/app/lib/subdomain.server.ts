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
 * Extract subdomain from the request hostname.
 * Handles both direct subdomains and nginx X-Subdomain header.
 */
export function extractSubdomain(request: Request): string | null {
  // First check for nginx forwarded subdomain header
  const forwardedSubdomain = request.headers.get("X-Subdomain");
  if (forwardedSubdomain) {
    return forwardedSubdomain;
  }

  // Parse from hostname
  const url = new URL(request.url);
  const hostname = request.headers.get("host") || url.hostname;
  const hostWithoutPort = hostname.split(":")[0];

  // Use CORE_DOMAIN from environment
  const appDomain = process.env.CORE_DOMAIN || "secretlobby.io";

  // Check if this is a subdomain of our app domain
  if (hostWithoutPort.endsWith(`.${appDomain}`)) {
    const subdomain = hostWithoutPort.replace(`.${appDomain}`, "");
    // Ignore www and empty subdomains
    if (subdomain && subdomain !== "www") {
      return subdomain;
    }
  }

  return null;
}

/**
 * Check if the hostname is a custom domain (not our app domain)
 */
export function isCustomDomain(request: Request): boolean {
  const url = new URL(request.url);
  const hostname = request.headers.get("host") || url.hostname;
  const hostWithoutPort = hostname.split(":")[0];

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

  // Try subdomain resolution first
  if (subdomain) {
    const account = await prisma.account.findUnique({
      where: { slug: subdomain },
      include: {
        lobbies: {
          where: { isDefault: true },
          take: 1,
        },
      },
    });

    if (account) {
      return {
        account,
        lobby: account.lobbies[0] || null,
        subdomain,
        isCustomDomain: false,
      };
    }
  }

  // Try custom domain resolution
  if (customDomain) {
    const url = new URL(request.url);
    const hostname = (
      request.headers.get("host") || url.hostname
    ).split(":")[0];

    const domain = await prisma.domain.findUnique({
      where: {
        domain: hostname,
        status: "VERIFIED",
      },
      include: {
        account: {
          include: {
            lobbies: {
              where: { isDefault: true },
              take: 1,
            },
          },
        },
      },
    });

    if (domain?.account) {
      return {
        account: domain.account,
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
