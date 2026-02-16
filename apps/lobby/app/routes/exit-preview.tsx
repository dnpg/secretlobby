import { redirect } from "react-router";
import type { Route } from "./+types/exit-preview";
import { getClearPreviewCookieHeader } from "~/lib/subdomain.server";

/**
 * Clears the preview cookie and redirects so the user exits preview mode.
 * Without the cookie, the next load will resolve tenant without preview (unpublished lobbies show not found).
 */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const redirectTo = url.searchParams.get("redirect") || "/";
  return redirect(redirectTo, {
    headers: { "Set-Cookie": getClearPreviewCookieHeader() },
  });
}
