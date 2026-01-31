import { redirect } from "react-router";
import type { Route } from "./+types/auth.google.callback";
import { getGoogleClient, authenticateWithGoogle, getSession, createSessionResponse } from "@secretlobby/auth";
import { createLogger, formatError } from "@secretlobby/logger";

const logger = createLogger({ service: "console:auth" });

export async function loader({ request }: Route.LoaderArgs) {
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

    // Authenticate or create user
    const user = await authenticateWithGoogle(googleUser);

    if (!user) {
      throw redirect("/login?error=unauthorized_domain");
    }

    // Check if user has any account access
    if (user.accounts.length === 0) {
      throw redirect("/login?error=no_account_access");
    }

    // Use the first account by default
    const primaryAccount = user.accounts[0];

    // Check if user has admin role (OWNER or ADMIN)
    const hasAdminRole = primaryAccount.role === "OWNER" || primaryAccount.role === "ADMIN";

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
      },
      request,
      "/"
    );
  } catch (err) {
    logger.error({ error: formatError(err) }, "Google OAuth callback error");
    throw redirect("/login?error=oauth_failed");
  }
}
