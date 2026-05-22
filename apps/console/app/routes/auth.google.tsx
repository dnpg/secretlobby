import { redirect } from "react-router";
import type { Route } from "./+types/auth.google";
import {
  getGoogleClient,
  isGoogleConfigured,
  updateSession,
  generateCodeVerifier,
  generateState,
} from "@secretlobby/auth";
import { prisma } from "@secretlobby/db";

// This loader serves two distinct flows behind one entry point:
//
//   1. Console / admin login (no extra query params) — the original
//      behavior. After Google validates, the callback creates / updates
//      a User + Account and signs the admin into the console.
//
//   2. Lobby-visitor sign-in (?lobby=<id>&returnPath=<path>). The lobby
//      app links here for "Sign in with Google" because the OAuth
//      client only has one redirect URI registered — this domain. The
//      callback detects the stashed lobby info, runs the LobbyUser
//      flow, and bounces the visitor back to their lobby's own host
//      via a signed handoff token.
//
// Both flows reuse the same Google client + iron-session OAuth state
// (googleState / googleCodeVerifier); they diverge in
// auth.google.callback.tsx based on whether lobbyOAuthLobbyId is set.

export async function loader({ request }: Route.LoaderArgs) {
  if (!isGoogleConfigured()) {
    throw redirect("/login?error=google_not_configured");
  }

  const google = getGoogleClient();
  if (!google) {
    throw redirect("/login?error=google_not_configured");
  }

  const url = new URL(request.url);
  const inviteCode = url.searchParams.get("inviteCode");
  const lobbyIdParam = url.searchParams.get("lobby");
  const returnPathParam = url.searchParams.get("returnPath");

  // Lobby visitor flow: validate the lobby and the destination host
  // before we initiate OAuth. Without these checks an attacker could:
  //   - point ?lobby=<id> at a lobby that doesn't enable Google sign-in
  //   - point ?host=<phishing.com> at a host they control and harvest
  //     the post-OAuth handoff token
  let lobbyOAuthLobbyId: string | undefined;
  let lobbyOAuthReturnPath: string | undefined;
  let lobbyOAuthReturnHost: string | undefined;
  if (lobbyIdParam) {
    const hostParam = url.searchParams.get("host");
    if (!hostParam) {
      throw redirect("/login?error=lobby_google_unavailable");
    }
    const requestedHost = hostParam.toLowerCase().split(":")[0];

    const lobby = await prisma.lobby.findUnique({
      where: { id: lobbyIdParam },
      select: {
        id: true,
        identityGoogle: true,
        isPublished: true,
        isDefault: true,
        accountId: true,
        account: { select: { slug: true } },
      },
    });
    if (!lobby || !lobby.isPublished || !lobby.identityGoogle) {
      throw redirect("/login?error=lobby_google_unavailable");
    }

    const coreDomain = (process.env.CORE_DOMAIN || "secretlobby.co").toLowerCase();
    const subdomainHost = `${lobby.account.slug.toLowerCase()}.${coreDomain}`;

    // Allow the subdomain unconditionally, and the localhost host in
    // dev. Custom domains have to be looked up against verified Domain
    // rows that point at this lobby (or at the account, for the
    // default lobby — account-level domains carry no lobbyId).
    let hostAllowed = false;
    if (
      requestedHost === subdomainHost ||
      requestedHost === "localhost" ||
      requestedHost.endsWith(".localhost")
    ) {
      hostAllowed = true;
    } else {
      const domain = await prisma.domain.findFirst({
        where: {
          domain: requestedHost,
          status: "VERIFIED",
          OR: [
            { lobbyId: lobby.id },
            { lobbyId: null, accountId: lobby.accountId },
          ],
        },
        select: { id: true, lobbyId: true },
      });
      if (domain && (domain.lobbyId === lobby.id || (domain.lobbyId === null && lobby.isDefault))) {
        hostAllowed = true;
      }
    }
    if (!hostAllowed) {
      throw redirect("/login?error=lobby_google_unavailable");
    }

    lobbyOAuthLobbyId = lobby.id;
    lobbyOAuthReturnHost = requestedHost;
    // Path stays simple to block open-redirects: must start with "/"
    // and must not be protocol-relative ("//evil.com").
    if (
      returnPathParam &&
      returnPathParam.startsWith("/") &&
      !returnPathParam.startsWith("//")
    ) {
      lobbyOAuthReturnPath = returnPathParam;
    }
  }

  const state = generateState();
  const codeVerifier = generateCodeVerifier();

  const authUrl = google.createAuthorizationURL(state, codeVerifier, [
    "openid",
    "email",
    "profile",
  ]);

  // Store OAuth + (optionally) lobby state. Both modes use the same
  // googleState / googleCodeVerifier; the callback branches on
  // lobbyOAuthLobbyId.
  const { response } = await updateSession(request, {
    googleState: state,
    googleCodeVerifier: codeVerifier,
    googleInviteCode: inviteCode || undefined,
    lobbyOAuthLobbyId,
    lobbyOAuthReturnPath,
    lobbyOAuthReturnHost,
  });

  const cookieHeader = response.headers.get("Set-Cookie");

  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl.toString(),
      ...(cookieHeader ? { "Set-Cookie": cookieHeader } : {}),
    },
  });
}
