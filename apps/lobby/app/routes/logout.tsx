import type { Route } from "./+types/logout";
import { logoutFromLobby, destroySession } from "@secretlobby/auth";
import { prisma } from "@secretlobby/db";
import { extractSubdomain } from "~/lib/subdomain.server";

/**
 * Extract lobby slug from a URL path
 * e.g., "/vip" returns "vip", "/vip/something" returns "vip", "/" returns null
 */
function extractLobbySlugFromPath(pathname: string): string | null {
  const pathParts = pathname.split("/").filter(Boolean);
  if (pathParts.length > 0) {
    const potentialSlug = pathParts[0];
    // Exclude known routes that aren't lobby slugs
    const excludedPaths = ["logout", "api", "assets", "favicon.ico", "robots.txt", "sitemap.xml"];
    if (!excludedPaths.includes(potentialSlug)) {
      return potentialSlug;
    }
  }
  return null;
}

/**
 * Find the lobby ID from the referer URL
 */
async function getLobbyIdFromReferer(request: Request): Promise<{ lobbyId: string | null; redirectPath: string }> {
  const referer = request.headers.get("referer");
  let redirectPath = "/";
  let lobbyId: string | null = null;

  if (!referer) {
    return { lobbyId: null, redirectPath };
  }

  try {
    const refererUrl = new URL(referer);
    redirectPath = refererUrl.pathname || "/";

    // Extract subdomain from referer to find account
    const subdomain = extractSubdomain(request); // Uses the main request headers which have the host

    if (!subdomain) {
      return { lobbyId: null, redirectPath };
    }

    // Find the account
    const account = await prisma.account.findUnique({
      where: { slug: subdomain },
      select: {
        id: true,
        lobbies: {
          select: {
            id: true,
            slug: true,
            isDefault: true,
          },
        },
      },
    });

    if (!account) {
      return { lobbyId: null, redirectPath };
    }

    // Extract lobby slug from referer path
    const lobbySlug = extractLobbySlugFromPath(refererUrl.pathname);

    if (lobbySlug) {
      // Find lobby by slug
      const lobby = account.lobbies.find(l => l.slug === lobbySlug);
      if (lobby) {
        lobbyId = lobby.id;
      }
    } else {
      // No slug in path - use default lobby
      const defaultLobby = account.lobbies.find(l => l.isDefault) || account.lobbies[0];
      if (defaultLobby) {
        lobbyId = defaultLobby.id;
      }
    }
  } catch {
    // Invalid referer URL, use defaults
  }

  return { lobbyId, redirectPath };
}

export async function action({ request }: Route.ActionArgs) {
  const { lobbyId, redirectPath } = await getLobbyIdFromReferer(request);

  // If we have a specific lobby, logout from just that lobby
  if (lobbyId) {
    return logoutFromLobby(request, lobbyId, redirectPath);
  }

  // Fallback: destroy entire session if no lobby context
  return destroySession(request, redirectPath);
}

export async function loader({ request }: Route.LoaderArgs) {
  const { lobbyId, redirectPath } = await getLobbyIdFromReferer(request);

  if (lobbyId) {
    return logoutFromLobby(request, lobbyId, redirectPath);
  }

  return destroySession(request, redirectPath);
}
