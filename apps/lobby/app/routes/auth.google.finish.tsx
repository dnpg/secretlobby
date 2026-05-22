// Google sign-in finish route (companion to the central console callback).
//
// The lobby visitor lands here after the console's auth.google.callback
// has verified Google's response, run checkLobbyAccess, and minted a
// signed handoff token (see @secretlobby/auth/lobby-oauth). We verify
// the token, double-check that the LobbyUser it names actually belongs
// to this tenant (defense in depth against a leaked token), and then
// hand the visitor a lobby session cookie.
//
// Failure paths bounce back to the lobby's canonical URL with
// `?reason=<code>` — the lobby's _index loader picks up the reason and
// surfaces the matching banner above the sign-in form. Visitors never
// see this URL beyond the brief redirect.

import { redirect } from "react-router";
import type { Route } from "./+types/auth.google.finish";
import { authenticateForLobby, getSession } from "@secretlobby/auth";
import { verifyLobbyOAuthHandoff } from "@secretlobby/auth/lobby-oauth";
import { prisma } from "@secretlobby/db";
import { resolveTenant } from "~/lib/subdomain.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get("t");
  if (!token) {
    throw redirect("/?reason=missing_token");
  }

  const verified = verifyLobbyOAuthHandoff(token);
  if (!verified.ok) {
    const reason = verified.reason === "expired" ? "expired" : "used_or_invalid";
    throw redirect(`/?reason=${reason}`);
  }

  // The token only proves the *console* believed this person was
  // authorized. We still verify the LobbyUser row exists and belongs
  // to a lobby on the tenant the visitor is currently on — guards
  // against a leaked token from another account being replayed here.
  const tenant = await resolveTenant(request);
  if (!tenant.account) {
    throw redirect("/");
  }

  const lobbyUser = await prisma.lobbyUser.findUnique({
    where: { id: verified.lobbyUserId },
    select: {
      id: true,
      email: true,
      lobby: {
        select: {
          id: true,
          slug: true,
          isDefault: true,
          accountId: true,
          isPublished: true,
          passwordRequired: true,
        },
      },
    },
  });
  if (
    !lobbyUser ||
    lobbyUser.lobby.id !== verified.lobbyId ||
    lobbyUser.lobby.accountId !== tenant.account.id ||
    !lobbyUser.lobby.isPublished
  ) {
    throw redirect("/?reason=lobby_mismatch");
  }

  // Shared-password gate: when the lobby has `passwordRequired`, the
  // visitor must have POSTed the password to the lobby root before the
  // OAuth round-trip started — that POST set `session.lobbyPasswordVerified`.
  // If the marker is missing, expired, or for a different lobby, the
  // visitor either skipped the gate (direct GET to AUTH_URL/auth/google)
  // or sat on the Google login screen for too long. Bounce them back
  // to the lobby root so they can re-enter the password.
  if (lobbyUser.lobby.passwordRequired) {
    const lobbyHome = lobbyUser.lobby.isDefault ? "/" : `/${lobbyUser.lobby.slug}`;
    const { session } = await getSession(request);
    const verifiedMarker = session.lobbyPasswordVerified;
    const passwordOk =
      verifiedMarker &&
      verifiedMarker.lobbyId === lobbyUser.lobby.id &&
      verifiedMarker.expiresAt > Date.now();
    if (!passwordOk) {
      // Don't drop a stale marker here — `updateSession` would mint a
      // new cookie just for that side-effect. The marker will simply
      // be ignored on subsequent finishes until it's overwritten.
      throw redirect(`${lobbyHome}?reason=password_required`);
    }
  }

  // Honor the explicit returnPath if it's a sane in-lobby path,
  // otherwise compute one from the lobby itself.
  const returnPathParam = url.searchParams.get("returnPath");
  const safeReturnPath =
    returnPathParam &&
    returnPathParam.startsWith("/") &&
    !returnPathParam.startsWith("//")
      ? returnPathParam
      : null;
  const target =
    safeReturnPath ??
    (lobbyUser.lobby.isDefault ? "/" : `/${lobbyUser.lobby.slug}`);

  // authenticateForLobby internally clears `session.lobbyPasswordVerified`
  // as part of completing the sign-in — keeps the marker's lifecycle
  // tied to "did the visitor actually get in" rather than scattering
  // the clear across every successful path.
  return authenticateForLobby(request, lobbyUser.lobby.id, target, lobbyUser.id);
}

export default function GoogleFinishRoute() {
  return null;
}
