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

  const state = generateState();
  const codeVerifier = generateCodeVerifier();

  const url = google.createAuthorizationURL(state, codeVerifier, [
    "openid",
    "email",
    "profile",
  ]);

  // Store state and code verifier in session for validation
  const { response } = await updateSession(request, {
    googleState: state,
    googleCodeVerifier: codeVerifier,
  });

  // Set the session cookie and redirect to Google
  const cookieHeader = response.headers.get("Set-Cookie");

  return new Response(null, {
    status: 302,
    headers: {
      Location: url.toString(),
      ...(cookieHeader ? { "Set-Cookie": cookieHeader } : {}),
    },
  });
}
