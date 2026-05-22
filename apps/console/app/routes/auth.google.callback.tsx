import { redirect } from "react-router";
import type { Route } from "./+types/auth.google.callback";
import { getGoogleClient, authenticateWithGoogle, getSession, createSessionResponse, updateSession } from "@secretlobby/auth";
import { checkLobbyAccess, normalizeEmail } from "@secretlobby/auth/lobby-access";
import { signLobbyOAuthHandoff } from "@secretlobby/auth/lobby-oauth";
import { prisma, InvitationStatus } from "@secretlobby/db";

export async function loader({ request }: Route.LoaderArgs) {
  const { checkRateLimit, createRateLimitResponse, RATE_LIMIT_CONFIGS, resetRateLimit } = await import("@secretlobby/auth/rate-limit");
  const { createLogger, formatError } = await import("@secretlobby/logger/server");
  const { getValidInvitationByCode, getSystemSettings } = await import("~/models/queries/invitation.server");

  const logger = createLogger({ service: "console:auth" });

  // Check rate limit for OAuth attempts
  const rateLimitResult = await checkRateLimit(request, RATE_LIMIT_CONFIGS.OAUTH);
  if (!rateLimitResult.allowed) {
    // For loaders, we need to throw the response
    throw createRateLimitResponse(rateLimitResult);
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  // Handle OAuth errors
  if (error) {
    logger.error({ error }, "Google OAuth error");
    throw redirect(`/login?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    throw redirect("/login?error=missing_oauth_params");
  }

  // Get stored state and code verifier from session
  const { session } = await getSession(request);
  const storedState = session.googleState;
  const codeVerifier = session.googleCodeVerifier;
  const inviteCode = session.googleInviteCode;

  if (!storedState || !codeVerifier) {
    throw redirect("/login?error=session_expired");
  }

  // Validate state to prevent CSRF
  if (state !== storedState) {
    throw redirect("/login?error=invalid_state");
  }

  try {
    const google = getGoogleClient();
    if (!google) {
      throw redirect("/login?error=google_not_configured");
    }

    // Exchange code for tokens
    const tokens = await google.validateAuthorizationCode(code, codeVerifier);
    const accessToken = tokens.accessToken();

    // Fetch user info from Google
    const userInfoResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!userInfoResponse.ok) {
      throw new Error("Failed to fetch user info from Google");
    }

    const googleUserInfo = (await userInfoResponse.json()) as {
      id: string; // Google v2 API uses 'id', not 'sub'
      email: string;
      name?: string;
      picture?: string;
    };

    // Map to GoogleUser format expected by authenticateWithGoogle
    const googleUser = {
      sub: googleUserInfo.id, // Map 'id' to 'sub' for compatibility
      email: googleUserInfo.email,
      name: googleUserInfo.name,
      picture: googleUserInfo.picture,
    };

    // Branch: if this OAuth round-trip started from a lobby (the lobby
    // app's "Sign in with Google" button parks the lobbyId in session
    // via auth.google.tsx), handle the lobby-visitor case and bail
    // before touching the console User/Account logic. The visitor
    // never becomes a console user — they just get a lobby session
    // cookie on their own host.
    if (session.lobbyOAuthLobbyId) {
      const lobbyId = session.lobbyOAuthLobbyId;
      const returnHost = session.lobbyOAuthReturnHost;
      const returnPath = session.lobbyOAuthReturnPath;

      // Always clear the stashed lobby state before we do anything that
      // could exit early. Avoids a half-consumed handoff if mail/db is
      // slow and the user retries.
      await updateSession(request, {
        lobbyOAuthLobbyId: undefined,
        lobbyOAuthReturnPath: undefined,
        lobbyOAuthReturnHost: undefined,
        googleState: undefined,
        googleCodeVerifier: undefined,
      });

      if (!returnHost) {
        logger.error({ lobbyId }, "Lobby OAuth callback missing returnHost");
        throw redirect("/login?error=oauth_failed");
      }

      // Look up the lobby + the account, with everything we need to
      // both authorize and redirect.
      const lobby = await prisma.lobby.findUnique({
        where: { id: lobbyId },
        select: {
          id: true,
          slug: true,
          isDefault: true,
          isPublished: true,
          identityGoogle: true,
          accessPolicy: true,
          allowedDomains: true,
        },
      });
      if (!lobby || !lobby.isPublished || !lobby.identityGoogle) {
        // The lobby toggled Google off (or got unpublished) between
        // the start of the flow and now.
        const proto = process.env.NODE_ENV === "production" ? "https" : "http";
        throw redirect(`${proto}://${returnHost}/auth/request-link?reason=not_authorized`);
      }

      const email = normalizeEmail(googleUser.email);
      const proto = process.env.NODE_ENV === "production" ? "https" : "http";
      const lobbyOrigin = `${proto}://${returnHost}`;
      const lobbyPath = returnPath ?? (lobby.isDefault ? "/" : `/${lobby.slug}`);

      const allowed = await checkLobbyAccess(
        { id: lobby.id, accessPolicy: lobby.accessPolicy, allowedDomains: lobby.allowedDomains },
        email,
      );
      if (!allowed.allowed) {
        logger.info(
          { lobbyId, reason: allowed.reason },
          "Lobby Google sign-in denied (policy)",
        );
        throw redirect(`${lobbyOrigin}/auth/request-link?reason=not_authorized`);
      }

      // Upsert the LobbyUser. First Google sign-in stamps googleSub
      // and flips status to ACTIVE; subsequent sign-ins refresh the
      // sub (cheap protection against a stale value) and lastSeenAt.
      const now = new Date();
      const lobbyUser = await prisma.lobbyUser.upsert({
        where: { lobbyId_email: { lobbyId: lobby.id, email } },
        create: {
          lobbyId: lobby.id,
          email,
          status: "ACTIVE",
          googleSub: googleUser.sub,
          firstLoginAt: now,
          lastSeenAt: now,
        },
        update: {
          status: "ACTIVE",
          googleSub: googleUser.sub,
          lastSeenAt: now,
          // firstLoginAt is intentionally omitted on update — Prisma
          // leaves omitted fields alone, so the original first-login
          // timestamp survives.
        },
        select: { id: true },
      });

      // Reset the OAuth rate-limit window — successful auth is a
      // valid retry signal.
      await resetRateLimit(request, RATE_LIMIT_CONFIGS.OAUTH);

      const handoff = signLobbyOAuthHandoff({
        lobbyId: lobby.id,
        lobbyUserId: lobbyUser.id,
      });
      const finishUrl = new URL(`${lobbyOrigin}/auth/google/finish`);
      finishUrl.searchParams.set("t", handoff);
      if (lobbyPath !== "/" && lobbyPath !== `/${lobby.slug}`) {
        finishUrl.searchParams.set("returnPath", lobbyPath);
      }
      throw redirect(finishUrl.toString());
    }

    // Check system settings for prelaunch mode
    const settings = await getSystemSettings();
    const prelaunchMode = settings?.prelaunchMode ?? false;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: googleUser.email.toLowerCase() },
    });

    // In prelaunch mode, validate invitation for new users
    let invitation = null;
    if (prelaunchMode && !existingUser) {
      // New user signup during prelaunch - require valid invitation
      if (!inviteCode) {
        throw redirect("/signup?error=invite_required");
      }

      invitation = await getValidInvitationByCode(inviteCode);
      if (!invitation) {
        throw redirect("/signup?error=invalid_invite");
      }

      // Verify email matches invitation
      if (invitation.email.toLowerCase() !== googleUser.email.toLowerCase()) {
        throw redirect("/signup?error=email_mismatch");
      }
    }

    // Authenticate or create user
    const user = await authenticateWithGoogle(googleUser);

    if (!user) {
      throw redirect("/login?error=unauthorized_domain");
    }

    // Mark invitation as used if this was a new signup with invitation
    if (invitation && !existingUser) {
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: {
          status: InvitationStatus.USED,
          usedAt: new Date(),
        },
      });

      // Update interested person if linked
      if (invitation.interestedPersonId) {
        await prisma.interestedPerson.update({
          where: { id: invitation.interestedPersonId },
          data: { convertedAt: new Date() },
        });
      }

      logger.info({ email: googleUser.email, invitationId: invitation.id }, "Invitation used for Google signup");
    }

    // Check if user has any account access
    if (user.accounts.length === 0) {
      throw redirect("/login?error=no_account_access");
    }

    // Use the first account by default
    const primaryAccount = user.accounts[0];

    // Check if user has admin role (OWNER or ADMIN)
    const hasAdminRole = primaryAccount.role === "OWNER" || primaryAccount.role === "ADMIN";

    // Reset rate limit on successful OAuth authentication
    await resetRateLimit(request, RATE_LIMIT_CONFIGS.OAUTH);

    // Clear OAuth state and set user session
    return createSessionResponse(
      {
        isAuthenticated: true,
        isAdmin: hasAdminRole,
        userId: user.id,
        userEmail: user.email,
        userName: user.name || undefined,
        currentAccountId: primaryAccount.accountId,
        currentAccountSlug: primaryAccount.account.slug,
        currentAccountRole: primaryAccount.role,
        // Clear OAuth state
        googleState: undefined,
        googleCodeVerifier: undefined,
        googleInviteCode: undefined,
      },
      request,
      "/"
    );
  } catch (err) {
    // Re-throw Response objects (from redirect() calls)
    if (err instanceof Response) {
      throw err;
    }

    logger.error({ error: formatError(err) }, "Google OAuth callback error");
    throw redirect("/login?error=oauth_failed");
  }
}
