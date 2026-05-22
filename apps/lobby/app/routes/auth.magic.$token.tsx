// Magic-link consume route.
//
// Visitors arrive here from a one-time URL in either:
//   - the "sign-in to <lobby>" email (PUBLIC + identityEmail)
//   - the admin invitation email (INVITE_ONLY)
//
// Loader-only. We consume the token (single-use), look up the Lobby the
// token was issued for (the URL only tells us the *account*, since the
// magic-link URL doesn't carry a lobby slug), double-check the current
// access policy, bind the session to the visitor's LobbyUser row, and
// redirect to the right lobby path. Any failure path bounces to
// /auth/request-link so they can self-serve a fresh link.

import { redirect } from "react-router";
import type { Route } from "./+types/auth.magic.$token";
import { authenticateForLobby } from "@secretlobby/auth";
import {
  consumeLobbyMagicLink,
  checkLobbyAccess,
} from "@secretlobby/auth/lobby-access";
import { prisma } from "@secretlobby/db";
import { resolveTenant } from "~/lib/subdomain.server";

export async function loader({ request, params }: Route.LoaderArgs) {
  const token = params.token;
  if (!token) {
    throw redirect("/auth/request-link?reason=missing_token");
  }

  // The URL only resolves the *account* (subdomain or custom domain).
  // We use the LobbyUser row to find the actual lobby that issued the
  // token, then verify it belongs to this account.
  const tenant = await resolveTenant(request);
  if (!tenant.account) {
    throw redirect("/");
  }

  const result = await consumeLobbyMagicLink(token);
  if (!result.ok) {
    // not_found covers both "never existed" and "already consumed" — we
    // collapse them so a forwarder can't tell whether the legit recipient
    // clicked first.
    const reason = result.reason === "expired" ? "expired" : "used_or_invalid";
    throw redirect(`/auth/request-link?reason=${reason}`);
  }

  const lobby = await prisma.lobby.findUnique({
    where: { id: result.lobbyUser.lobbyId },
    select: {
      id: true,
      slug: true,
      isDefault: true,
      accountId: true,
      accessPolicy: true,
      allowedDomains: true,
    },
  });
  if (!lobby || lobby.accountId !== tenant.account.id) {
    throw redirect("/auth/request-link?reason=lobby_mismatch");
  }

  // Defense in depth: re-run the policy check on the consumed email.
  // Guards against the admin tightening the policy between issue and
  // click (e.g. removing a domain from the allowlist).
  const allowed = await checkLobbyAccess(
    {
      id: lobby.id,
      accessPolicy: lobby.accessPolicy,
      allowedDomains: lobby.allowedDomains,
    },
    result.lobbyUser.email,
  );
  if (!allowed.allowed) {
    throw redirect("/auth/request-link?reason=not_authorized");
  }

  const redirectPath = lobby.isDefault ? "/" : `/${lobby.slug}`;
  return authenticateForLobby(
    request,
    lobby.id,
    redirectPath,
    result.lobbyUser.id,
  );
}

// Route renders nothing — loader always throws a redirect.
export default function MagicLinkConsumeRoute() {
  return null;
}
