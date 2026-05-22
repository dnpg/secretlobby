// Request-link route.
//
// Two entry points land visitors here:
//
//   1. /auth/magic/<token> failed (expired / already used / policy changed)
//      → loader receives `?reason=...` and shows a banner.
//   2. The lobby's login page redirects here when the lobby is configured
//      for email-based entry (identityEmail = true) and the visitor needs
//      to request their first link.
//
// POST: validate (and verify password if the lobby has one), run
// checkLobbyAccess, issue + send a magic link, then ALWAYS render the
// neutral "if you're authorized we sent you a link" success state. The
// only failure surfaced to the user is "wrong password" — the password
// is a shared secret meant to be hard to guess, not a private fact, so
// admitting "wrong password" doesn't leak invite-list membership.

import { useEffect } from "react";
import { Form, useActionData, useLoaderData, useNavigation, redirect } from "react-router";
import type { Route } from "./+types/auth.request-link";
import {
  getSession,
  isAuthenticatedForLobby,
} from "@secretlobby/auth";
import { verifyLobbyPassword } from "@secretlobby/auth/lobby-password";
import {
  checkLobbyAccess,
  issueLobbyMagicLink,
  normalizeEmail,
  isValidEmailShape,
  LOBBY_MAGIC_LINK_TTL_MS,
} from "@secretlobby/auth/lobby-access";
import { sendLobbyMagicLinkEmail } from "@secretlobby/email";
import { prisma } from "@secretlobby/db";
import { resolveTenant } from "~/lib/subdomain.server";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Sign in - ${data?.lobbyTitle || "Lobby"}` }];
}

const REASON_MESSAGES: Record<string, string> = {
  expired:
    "That sign-in link has expired. Enter your email to get a new one.",
  used_or_invalid:
    "That sign-in link is no longer valid. If you should have access, enter your email and we'll send you a new one.",
  lobby_mismatch:
    "That sign-in link is for a different lobby. Enter your email to get a fresh link for this one.",
  not_authorized:
    "That email isn't currently authorized to access this lobby. If this is wrong, please contact the lobby owner.",
  missing_token:
    "Sign-in link was missing. Enter your email below to get a new one.",
};

interface SelectedLobby {
  id: string;
  slug: string;
  isDefault: boolean;
  title: string | null;
  name: string;
  accessPolicy: "PUBLIC" | "INVITE_ONLY" | "DOMAIN_ALLOWLIST";
  allowedDomains: string[];
  passwordRequired: boolean;
  passwordEncrypted: string | null;
  identityEmail: boolean;
  identityGoogle: boolean;
}

async function selectLobby(
  request: Request,
  lobbySlugFromQuery: string | null,
): Promise<{ account: { id: string; slug: string } | null; lobby: SelectedLobby | null }> {
  const tenant = await resolveTenant(request);
  if (!tenant.account) {
    return { account: null, lobby: null };
  }
  const accountId = tenant.account.id;

  // Pull all lobbies on the account so we can pick by slug. We only
  // need a small projection — keep the query cheap.
  const lobbies = await prisma.lobby.findMany({
    where: { accountId, isPublished: true },
    select: {
      id: true,
      slug: true,
      isDefault: true,
      title: true,
      name: true,
      accessPolicy: true,
      allowedDomains: true,
      passwordRequired: true,
      password: true,
      identityEmail: true,
      identityGoogle: true,
    },
  });

  let row =
    (lobbySlugFromQuery && lobbies.find((l) => l.slug === lobbySlugFromQuery)) ||
    lobbies.find((l) => l.isDefault) ||
    lobbies[0] ||
    null;
  if (!row) {
    return { account: { id: tenant.account.id, slug: tenant.account.slug }, lobby: null };
  }

  return {
    account: { id: tenant.account.id, slug: tenant.account.slug },
    lobby: {
      id: row.id,
      slug: row.slug,
      isDefault: row.isDefault,
      title: row.title,
      name: row.name,
      accessPolicy: row.accessPolicy,
      allowedDomains: row.allowedDomains,
      passwordRequired: row.passwordRequired,
      passwordEncrypted: row.password,
      identityEmail: row.identityEmail,
      identityGoogle: row.identityGoogle,
    },
  };
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const lobbySlugFromQuery = url.searchParams.get("lobby");
  const reason = url.searchParams.get("reason");

  const { lobby } = await selectLobby(request, lobbySlugFromQuery);
  if (!lobby) {
    throw redirect("/");
  }

  // If the lobby doesn't accept ANY identity method, the form here is
  // pointless — bounce back to the lobby itself (which will either let
  // them in for PUBLIC + no-password, or show the inline password form).
  if (!lobby.identityEmail && !lobby.identityGoogle) {
    const target = lobby.isDefault ? "/" : `/${lobby.slug}`;
    throw redirect(target);
  }

  // Already authenticated for this lobby? Skip the form.
  const { session } = await getSession(request);
  if (isAuthenticatedForLobby(session, lobby.id)) {
    const target = lobby.isDefault ? "/" : `/${lobby.slug}`;
    throw redirect(target);
  }

  // Build the Google "Sign in with Google" URL up front so the view
  // can render a plain anchor. The console-side handler validates the
  // host claim — see apps/console/app/routes/auth.google.tsx.
  let googleUrl: string | null = null;
  if (lobby.identityGoogle) {
    const authBase = process.env.AUTH_URL;
    if (authBase) {
      const host = url.host;
      const returnPath = lobby.isDefault ? "/" : `/${lobby.slug}`;
      const params = new URLSearchParams({
        lobby: lobby.id,
        host,
        returnPath,
      });
      googleUrl = `${authBase.replace(/\/$/, "")}/auth/google?${params.toString()}`;
    }
  }

  return {
    lobbyTitle: lobby.title || lobby.name,
    lobbyName: lobby.name,
    lobbySlug: lobby.slug,
    lobbyIsDefault: lobby.isDefault,
    passwordRequired: lobby.passwordRequired,
    identityEmail: lobby.identityEmail,
    identityGoogle: lobby.identityGoogle,
    googleUrl,
    reason: reason && REASON_MESSAGES[reason] ? reason : null,
    reasonMessage: reason ? REASON_MESSAGES[reason] ?? null : null,
    expiresInDays: Math.round(LOBBY_MAGIC_LINK_TTL_MS / (24 * 60 * 60 * 1000)),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { checkRateLimit, RATE_LIMIT_CONFIGS, getClientIp } = await import(
    "@secretlobby/auth/rate-limit"
  );
  const { createLogger, formatError } = await import("@secretlobby/logger/server");
  const logger = createLogger({ service: "lobby:request-link" });

  const formData = await request.formData();
  const emailRaw = (formData.get("email") as string) || "";
  const password = (formData.get("password") as string) || "";
  const lobbySlugFromForm = (formData.get("lobbySlug") as string) || null;

  const { lobby } = await selectLobby(request, lobbySlugFromForm);
  if (!lobby || !lobby.identityEmail) {
    return { error: "This lobby doesn't support email sign-in." };
  }

  // Rate-limit before we touch the DB or send mail. Each successful
  // call sends an email, so this also caps outbound spam to whatever
  // address an attacker picks.
  const rateLimitResult = await checkRateLimit(request, RATE_LIMIT_CONFIGS.LOBBY_MAGIC_LINK);
  if (!rateLimitResult.allowed) {
    return {
      error: `Too many requests. Try again in ${Math.ceil(rateLimitResult.resetInSeconds / 60)} minutes.`,
    };
  }

  const email = normalizeEmail(emailRaw);
  if (!isValidEmailShape(email)) {
    return { error: "Please enter a valid email address." };
  }

  // Password is a shared secret — "wrong password" is safe to surface.
  // We check it before policy so a stranger guessing the password also
  // gets the rate-limit treatment (still capped at 5/h).
  if (lobby.passwordRequired) {
    if (!verifyLobbyPassword(password, lobby.passwordEncrypted ?? "")) {
      return { error: "Incorrect password.", email: emailRaw };
    }
  }

  const allowed = await checkLobbyAccess(
    { id: lobby.id, accessPolicy: lobby.accessPolicy, allowedDomains: lobby.allowedDomains },
    email,
  );

  // Important: from here down, the response is the same whether or not
  // the email is allowed in. Leaking "you aren't on the invite list"
  // would let attackers enumerate the invite list one address at a time.
  if (!allowed.allowed) {
    logger.info(
      { lobbyId: lobby.id, reason: allowed.reason, ip: getClientIp(request) },
      "Magic link denied (policy)",
    );
    return { success: true };
  }

  try {
    const { token } = await issueLobbyMagicLink({ lobbyId: lobby.id, email });
    const url = new URL(request.url);
    const magicLinkUrl = `${url.origin}/auth/magic/${token}`;
    await sendLobbyMagicLinkEmail({
      to: email,
      lobbyName: lobby.title || lobby.name,
      magicLinkUrl,
      lobbyDisplayHost: url.host,
    });
  } catch (error) {
    logger.error(
      { error: formatError(error), lobbyId: lobby.id },
      "Failed to issue lobby magic link",
    );
    // Still return success — the user can't act on this failure, and
    // surfacing it would distinguish "allowed but mail failed" from
    // "policy denied," reintroducing the enumeration leak.
  }

  return { success: true };
}

export default function RequestLinkPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Reset the form input value when the loader's reason changes — the
  // user is likely arriving from a fresh failure path and the previous
  // submission's value is stale.
  useEffect(() => {}, [data.reason]);

  const submitted = actionData && "success" in actionData && actionData.success;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-xl p-8 shadow-xl">
        <h1 className="text-2xl font-semibold text-white mb-2">
          Sign in to {data.lobbyTitle}
        </h1>
        <p className="text-sm text-gray-400 mb-6">
          We'll email you a one-time link to enter the lobby.
        </p>

        {data.reasonMessage && (
          <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-sm">
            {data.reasonMessage}
          </div>
        )}

        {submitted ? (
          <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 text-green-300 text-sm">
            If that email is authorized to access this lobby, we've sent a
            sign-in link. The link expires in {data.expiresInDays} day
            {data.expiresInDays === 1 ? "" : "s"} and can only be used once.
            Check your spam folder if you don't see it.
          </div>
        ) : (
          <>
            {data.identityGoogle && data.googleUrl && (
              <a
                href={data.googleUrl}
                className="w-full mb-4 inline-flex items-center justify-center gap-3 px-4 py-2 bg-white text-gray-900 hover:bg-gray-100 font-medium rounded-lg cursor-pointer transition"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continue with Google
              </a>
            )}

            {data.identityEmail && data.identityGoogle && (
              <div className="my-4 flex items-center gap-3 text-xs uppercase tracking-wider text-gray-500">
                <div className="flex-1 h-px bg-gray-800" />
                <span>or</span>
                <div className="flex-1 h-px bg-gray-800" />
              </div>
            )}

            {data.identityEmail && (
              <Form method="post" className="space-y-4">
                <input type="hidden" name="lobbySlug" value={data.lobbySlug} />

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-200 mb-1">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    name="email"
                    required
                    autoComplete="email"
                    defaultValue={actionData && "email" in actionData ? actionData.email : ""}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="you@example.com"
                  />
                </div>

                {data.passwordRequired && (
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-200 mb-1">
                      Lobby password
                    </label>
                    <input
                      id="password"
                      type="password"
                      name="password"
                      required
                      autoComplete="off"
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      This is the password the lobby owner shared with you.
                    </p>
                  </div>
                )}

                {actionData && "error" in actionData && actionData.error && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
                    {actionData.error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg cursor-pointer transition"
                >
                  {isSubmitting ? "Sending..." : "Send sign-in link"}
                </button>
              </Form>
            )}
          </>
        )}

        <p className="mt-6 text-xs text-gray-500">
          Trouble signing in? Please contact the lobby owner.
        </p>
      </div>
    </div>
  );
}
