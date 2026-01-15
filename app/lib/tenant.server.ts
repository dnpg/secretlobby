import { prisma } from "./db.server";
import type { Account, Lobby, Domain } from "@prisma/client";

const APP_DOMAIN = process.env.APP_DOMAIN || "secretlobby.io";

export interface TenantContext {
  account: Account | null;
  lobby: Lobby | null;
  domain: Domain | null;
  subdomain: string | null;
  isCustomDomain: boolean;
}

/**
 * Extract subdomain from hostname
 * e.g., "myband.secretlobby.io" -> "myband"
 */
export function extractSubdomain(hostname: string): string | null {
  const domain = APP_DOMAIN.toLowerCase();
  const host = hostname.toLowerCase();

  // Check if this is our main domain
  if (host === domain || host === `www.${domain}`) {
    return null;
  }

  // Check if this is a subdomain of our main domain
  const subdomain = host.replace(`.${domain}`, "");
  if (subdomain !== host && subdomain.length > 0) {
    // Skip system subdomains
    const systemSubdomains = ["www", "api", "admin", "app", "static"];
    if (systemSubdomains.includes(subdomain)) {
      return null;
    }
    return subdomain;
  }

  return null;
}

/**
 * Check if hostname is a custom domain (not our main domain)
 */
export function isCustomDomain(hostname: string): boolean {
  const domain = APP_DOMAIN.toLowerCase();
  const host = hostname.toLowerCase();
  return !host.endsWith(domain);
}

/**
 * Resolve tenant from request
 * Checks subdomain first, then custom domain
 */
export async function resolveTenant(request: Request): Promise<TenantContext> {
  const url = new URL(request.url);
  const hostname = request.headers.get("X-Original-Host") || url.hostname;

  // Check for subdomain header from nginx
  const subdomainHeader = request.headers.get("X-Subdomain");

  let subdomain = subdomainHeader || extractSubdomain(hostname);
  let customDomain = isCustomDomain(hostname) ? hostname : null;

  // Try to find account by subdomain
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
        domain: null,
        subdomain,
        isCustomDomain: false,
      };
    }
  }

  // Try to find by custom domain
  if (customDomain) {
    const domain = await prisma.domain.findUnique({
      where: { domain: customDomain, status: "VERIFIED" },
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

    if (domain && domain.account) {
      // If domain points to specific lobby, use that
      let lobby: Lobby | null = null;
      if (domain.lobbyId) {
        lobby = await prisma.lobby.findUnique({
          where: { id: domain.lobbyId },
        });
      }

      return {
        account: domain.account,
        lobby: lobby || domain.account.lobbies[0] || null,
        domain,
        subdomain: null,
        isCustomDomain: true,
      };
    }
  }

  // No tenant found
  return {
    account: null,
    lobby: null,
    domain: null,
    subdomain,
    isCustomDomain: !!customDomain,
  };
}

/**
 * Get DNS instructions for custom domain verification
 */
export function getDnsInstructions(domain: Domain): {
  cname: { name: string; value: string };
  txt: { name: string; value: string };
} {
  return {
    cname: {
      name: domain.domain,
      value: `${APP_DOMAIN}`,
    },
    txt: {
      name: `_secretlobby.${domain.domain}`,
      value: `verify=${domain.verificationToken}`,
    },
  };
}

/**
 * Verify domain DNS settings
 */
export async function verifyDomainDns(domainId: string): Promise<boolean> {
  const domain = await prisma.domain.findUnique({
    where: { id: domainId },
  });

  if (!domain) return false;

  // In production, you would use DNS lookup libraries like `dns` or services
  // For now, this is a placeholder
  // You could use: import dns from 'dns/promises';
  // const records = await dns.resolveTxt(`_secretlobby.${domain.domain}`);

  // Update last checked time
  await prisma.domain.update({
    where: { id: domainId },
    data: { lastCheckedAt: new Date() },
  });

  // TODO: Implement actual DNS verification
  // For development, you could manually verify

  return false;
}
