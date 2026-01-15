import { redirect } from "react-router";
import type { Route } from "./+types/auth.google";
import { google, isGoogleConfigured } from "~/lib/auth.server";
import { updateSession } from "~/lib/session.server";
import { generateCodeVerifier, generateState } from "arctic";

export async function loader({ request }: Route.LoaderArgs) {
  if (!isGoogleConfigured()) {
    throw redirect("/admin/login?error=google_not_configured");
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
