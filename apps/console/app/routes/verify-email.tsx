import { redirect } from "react-router";
import type { Route } from "./+types/verify-email";

export async function loader({ request }: Route.LoaderArgs) {
  const { verifyEmailWithToken } = await import("@secretlobby/auth/verification");
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return redirect("/login?error=missing_token");
  }

  const result = await verifyEmailWithToken(token);

  if (result.success) {
    return redirect("/profile?verified=1");
  }

  if (result.error === "already_verified") {
    return redirect("/profile?verified=already");
  }

  return redirect("/profile?verify_error=invalid");
}

export default function VerifyEmail() {
  return null;
}
