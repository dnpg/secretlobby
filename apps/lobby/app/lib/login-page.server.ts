// Magic-link + login-page helpers for the lobby root route.
//
// Lobby visitors never see a separate auth URL — `_index.tsx` renders
// either the authenticated content or the sign-in form on the same
// canonical path (`/` or `/<slug>`). These helpers factor out the bits
// of that flow that don't fit naturally inline: the magic-link
// submission handler, the Google sign-in URL builder, and the
// reason-code → user-facing-message lookup the failure paths use.

import {
  checkLobbyAccess,
  issueLobbyMagicLink,
  normalizeEmail,
  isValidEmailShape,
  LOBBY_MAGIC_LINK_TTL_MS,
} from "@secretlobby/auth/lobby-access";
import { verifyLobbyPassword } from "@secretlobby/auth/lobby-password";
import { sendLobbyMagicLinkEmail } from "@secretlobby/email";

// Banner copy used when the visitor lands on the lobby root after a
// failed magic-link click or denied OAuth flow. The consumer routes
// redirect here with `?reason=<key>` appended.
export const LOGIN_REASON_MESSAGES: Record<string, string> = {
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
  password_required:
    "Please enter the lobby password and continue with Google again — your previous attempt timed out.",
};

export function resolveLoginReasonMessage(reason: string | null): string | null {
  if (!reason) return null;
  return LOGIN_REASON_MESSAGES[reason] ?? null;
}

interface MagicLinkLobby {
  id: string;
  slug: string;
  title: string | null;
  name: string;
  isDefault: boolean;
  accessPolicy: "PUBLIC" | "INVITE_ONLY" | "DOMAIN_ALLOWLIST";
  allowedDomains: string[];
  passwordRequired: boolean;
  password: string | null;
  identityEmail: boolean;
  identityGoogle: boolean;
}

/**
 * Build the URL the "Continue with Google" button links to. Returns
 * null when either Google identity is disabled for this lobby or
 * AUTH_URL isn't configured — the LoginPanel will then hide the button.
 */
export function getLobbyGoogleSignInUrl(
  request: Request,
  lobby: { id: string; slug: string; isDefault: boolean; identityGoogle: boolean },
): string | null {
  if (!lobby.identityGoogle) return null;
  const authBase = process.env.AUTH_URL;
  if (!authBase) return null;
  const url = new URL(request.url);
  const host = url.host;
  const returnPath = lobby.isDefault ? "/" : `/${lobby.slug}`;
  const params = new URLSearchParams({
    lobby: lobby.id,
    host,
    returnPath,
  });
  return `${authBase.replace(/\/$/, "")}/auth/google?${params.toString()}`;
}

/** Days surfaced in the success banner. Derived from the TTL constant. */
export const LOGIN_MAGIC_LINK_EXPIRES_IN_DAYS = Math.round(
  LOBBY_MAGIC_LINK_TTL_MS / (24 * 60 * 60 * 1000),
);

export type MagicLinkActionResult =
  | { magicLink: true; success: true }
  | { magicLink: true; error: string };

/**
 * Handle the email-magic-link form submitted from the lobby root.
 *
 * Returns `{ success: true }` whether or not the email was allowed in
 * — "you aren't on the invite list" would let an attacker enumerate
 * the invite list one address at a time. Only the wrong-password case
 * is surfaced (the shared password is meant to be hard to guess, not
 * private). Caller is expected to render the success state above the
 * form instead of swapping the URL.
 */
export async function handleMagicLinkRequest(
  request: Request,
  lobby: MagicLinkLobby,
  formData: FormData,
): Promise<MagicLinkActionResult> {
  const { checkRateLimit, RATE_LIMIT_CONFIGS, getClientIp } = await import(
    "@secretlobby/auth/rate-limit"
  );
  const { createLogger, formatError } = await import(
    "@secretlobby/logger/server"
  );
  const logger = createLogger({ service: "lobby:magic-link" });

  if (!lobby.identityEmail) {
    return { magicLink: true, error: "This lobby doesn't accept email sign-in." };
  }

  const rateLimitResult = await checkRateLimit(
    request,
    RATE_LIMIT_CONFIGS.LOBBY_MAGIC_LINK,
  );
  if (!rateLimitResult.allowed) {
    return {
      magicLink: true,
      error: `Too many requests. Try again in ${Math.ceil(rateLimitResult.resetInSeconds / 60)} minutes.`,
    };
  }

  const emailRaw = (formData.get("email") as string) || "";
  const password = (formData.get("password") as string) || "";

  const email = normalizeEmail(emailRaw);
  if (!isValidEmailShape(email)) {
    return { magicLink: true, error: "Please enter a valid email address." };
  }

  if (lobby.passwordRequired) {
    if (!verifyLobbyPassword(password, lobby.password ?? "")) {
      return { magicLink: true, error: "Incorrect password." };
    }
  }

  const allowed = await checkLobbyAccess(
    {
      id: lobby.id,
      accessPolicy: lobby.accessPolicy,
      allowedDomains: lobby.allowedDomains,
    },
    email,
  );

  if (!allowed.allowed) {
    logger.info(
      { lobbyId: lobby.id, reason: allowed.reason, ip: getClientIp(request) },
      "Magic link denied (policy)",
    );
    return { magicLink: true, success: true };
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
    // Still return success — telling the user "we couldn't send the
    // email" would split "allowed but mail failed" from "not allowed"
    // and reintroduce the enumeration leak.
  }

  return { magicLink: true, success: true };
}
