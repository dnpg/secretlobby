import { redirect } from "react-router";
import type { Route } from "./+types/auth.google.callback";
import { google, authenticateWithGoogle } from "~/lib/auth.server";
import { getSession, createSessionResponse } from "~/lib/session.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  // Handle OAuth errors
  if (error) {
    console.error("Google OAuth error:", error);
    throw redirect(`/admin/login?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    throw redirect("/admin/login?error=missing_oauth_params");
  }

  // Get stored state and code verifier from session
  const { session } = await getSession(request);
  const storedState = session.googleState;
  const codeVerifier = session.googleCodeVerifier;

  if (!storedState || !codeVerifier) {
    throw redirect("/admin/login?error=session_expired");
  }

  // Validate state to prevent CSRF
  if (state !== storedState) {
    throw redirect("/admin/login?error=invalid_state");
  }

  try {
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

    const googleUser = (await userInfoResponse.json()) as {
      email: string;
      name?: string;
      picture?: string;
    };

    // Authenticate or create user
    const user = await authenticateWithGoogle(googleUser);

    if (!user) {
      throw redirect("/admin/login?error=unauthorized_domain");
    }

    // Check if user has any account access
    if (user.accounts.length === 0) {
      throw redirect("/admin/login?error=no_account_access");
    }

    // Use the first account by default
    const primaryAccount = user.accounts[0];

    // Check if user has admin role (OWNER or ADMIN)
    const hasAdminRole = primaryAccount.role === "OWNER" || primaryAccount.role === "ADMIN";

    // Clear OAuth state and set user session
    return createSessionResponse(
      {
        isAuthenticated: true,
        isAdmin: hasAdminRole, // Legacy flag for backward compatibility
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
      "/admin"
    );
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    throw redirect("/admin/login?error=oauth_failed");
  }
}
