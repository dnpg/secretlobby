import { redirect } from "react-router";
import type { Route } from "./+types/auth.google";
import { getGoogleClient, isGoogleConfigured, updateSession, generateCodeVerifier, generateState } from "@secretlobby/auth";

export async function loader({ request }: Route.LoaderArgs) {
  if (!isGoogleConfigured()) {
    throw redirect("/login?error=google_not_configured");
  }

  const google = getGoogleClient();
  if (!google) {
    throw redirect("/login?error=google_not_configured");
  }

  // Check for invitation code in query params (for prelaunch signup)
  const url = new URL(request.url);
  const inviteCode = url.searchParams.get("inviteCode");

  const state = generateState();
  const codeVerifier = generateCodeVerifier();

  const authUrl = google.createAuthorizationURL(state, codeVerifier, [
    "openid",
    "email",
    "profile",
  ]);

  // Store state, code verifier, and invitation code in session for validation
  const { response } = await updateSession(request, {
    googleState: state,
    googleCodeVerifier: codeVerifier,
    googleInviteCode: inviteCode || undefined,
  });

  // Set the session cookie and redirect to Google
  const cookieHeader = response.headers.get("Set-Cookie");

  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl.toString(),
      ...(cookieHeader ? { "Set-Cookie": cookieHeader } : {}),
    },
  });
}
