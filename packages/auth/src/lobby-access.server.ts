// Lobby access control: identity + policy logic.
// -----------------------------------------------------------------------------
// Companion to lobby-password.server.ts. This module owns the runtime
// decisions for two orthogonal axes on each Lobby:
//
//   * accessPolicy:   PUBLIC | INVITE_ONLY | DOMAIN_ALLOWLIST
//   * identity flags: identityEmail (magic link) and identityGoogle (OAuth)
//
// Plus the password gate (passwordRequired) which composes on top.
//
// What lives here:
//
//   - Pure helpers (no DB): normalizeEmail, extractEmailDomain,
//     isDomainAllowed.
//   - checkLobbyAccess(lobby, email): the single decision point for
//     "should this email be allowed in?" — reads the LobbyUser invite
//     list when policy = INVITE_ONLY. Use it from every place that
//     accepts an identified visitor (magic-link request, magic-link
//     consume, Google callback). Centralizing it avoids drift between
//     the routes.
//   - issueLobbyMagicLink / consumeLobbyMagicLink: token lifecycle.
//     Tokens are 32 random bytes hex, single-use, with a 7-day TTL.
//     On consume the token is cleared (so a forwarded link is dead),
//     the LobbyUser is marked ACTIVE, and firstLoginAt / lastSeenAt
//     are set. The lobby-scoped session cookie that keeps them logged
//     in is the caller's responsibility — see authenticateForLobby.
//
// What does NOT live here:
//
//   - Email rendering / sending: callers obtain the token from
//     issueLobbyMagicLink and hand it to one of the @secretlobby/email
//     senders (sendLobbyMagicLinkEmail or sendLobbyInvitationEmail).
//     Keeps the helper testable without mocking SMTP.
//   - Session cookies: see session.server.ts (authenticateForLobby).

import { randomBytes } from "node:crypto";
import { prisma, type Lobby, type LobbyUser } from "@secretlobby/db";

// 7-day TTL matches the existing platform Invitation flow and gives
// people time to find the email in spam without leaving links live for
// weeks. Each link is also single-use — once consumed the token row is
// cleared, so the "fresh link" flow is the only way back in on a new
// device.
export const LOBBY_MAGIC_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Lobby-scoped session cookie length. 30 days = the visitor doesn't have
// to keep hitting "send me a new link" every visit. Independent of the
// magic-link TTL above; the URL dies on first click regardless.
export const LOBBY_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const TOKEN_BYTES = 32; // 64 hex chars — matches Invitation.code length

// RFC 5321/5322 is too permissive for our purposes; we just need a sane
// "looks like an email, has exactly one @, has a domain with a dot."
// Anything that passes this still gets a magic link emailed, which is
// the real verification.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// =============================================================================
// Pure helpers
// =============================================================================

/** Lowercase + trim. Always call before storing or comparing emails. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** True iff `email` looks vaguely like an email address. */
export function isValidEmailShape(email: string): boolean {
  return EMAIL_SHAPE.test(email);
}

/**
 * Returns the lowercased domain portion of an email, or null if the input
 * isn't a well-formed email. Callers should normalize first.
 */
export function extractEmailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return domain.length > 0 ? domain : null;
}

/**
 * True iff the email's domain matches any of `allowedDomains` (also
 * case-insensitive). An empty allow-list returns false — callers should
 * gate this behind the accessPolicy = DOMAIN_ALLOWLIST check.
 */
export function isDomainAllowed(
  email: string,
  allowedDomains: readonly string[],
): boolean {
  if (allowedDomains.length === 0) return false;
  const domain = extractEmailDomain(email);
  if (!domain) return false;
  return allowedDomains.some((d) => d.trim().toLowerCase() === domain);
}

// =============================================================================
// Access decision
// =============================================================================

export type LobbyAccessCheck =
  | { allowed: true }
  | { allowed: false; reason: "invalid_email" | "not_invited" | "domain_not_allowed" };

// Caller can pass either a full Lobby row or just the access-control
// fields it cares about — keeps loaders from over-fetching.
export type LobbyAccessShape = Pick<
  Lobby,
  "id" | "accessPolicy" | "allowedDomains"
>;

/**
 * Decide whether `email` is allowed into the given lobby under its
 * current accessPolicy. Reads the LobbyUser invite list when needed.
 *
 * Call this from every entry point that accepts an identified visitor:
 *   - issuing a magic link
 *   - completing a Google sign-in
 *   - consuming a magic link (belt-and-suspenders; the policy may have
 *     changed between issue and click)
 *
 * For PUBLIC lobbies this is effectively a no-op other than the email
 * shape check.
 */
export async function checkLobbyAccess(
  lobby: LobbyAccessShape,
  email: string,
): Promise<LobbyAccessCheck> {
  const normalized = normalizeEmail(email);
  if (!isValidEmailShape(normalized)) {
    return { allowed: false, reason: "invalid_email" };
  }

  switch (lobby.accessPolicy) {
    case "PUBLIC":
      return { allowed: true };

    case "DOMAIN_ALLOWLIST":
      return isDomainAllowed(normalized, lobby.allowedDomains)
        ? { allowed: true }
        : { allowed: false, reason: "domain_not_allowed" };

    case "INVITE_ONLY": {
      const existing = await prisma.lobbyUser.findUnique({
        where: { lobbyId_email: { lobbyId: lobby.id, email: normalized } },
        select: { id: true },
      });
      return existing
        ? { allowed: true }
        : { allowed: false, reason: "not_invited" };
    }
  }
}

// =============================================================================
// Magic-link lifecycle
// =============================================================================

export interface IssueMagicLinkOptions {
  lobbyId: string;
  email: string;
  /** Set when an admin is pre-inviting; ignored on visitor-initiated requests. */
  invitedByUserId?: string;
  /** Override the default TTL (rarely needed; tests use it). */
  ttlMs?: number;
}

export interface IssuedMagicLink {
  /** Plaintext token to embed in the URL. Persisted as-is on the row. */
  token: string;
  expiresAt: Date;
  lobbyUser: LobbyUser;
}

/**
 * Upsert a LobbyUser for (lobbyId, email) and stamp a fresh magic-link
 * token on it. Any previous outstanding token on this row is overwritten —
 * one live link per user at a time.
 *
 * Does NOT enforce checkLobbyAccess. Caller must run that first; admins
 * pre-inviting bypass the policy check, public-mode visitors don't.
 */
export async function issueLobbyMagicLink({
  lobbyId,
  email,
  invitedByUserId,
  ttlMs = LOBBY_MAGIC_LINK_TTL_MS,
}: IssueMagicLinkOptions): Promise<IssuedMagicLink> {
  const normalized = normalizeEmail(email);
  const token = randomBytes(TOKEN_BYTES).toString("hex");
  const expiresAt = new Date(Date.now() + ttlMs);
  const now = new Date();

  const lobbyUser = await prisma.lobbyUser.upsert({
    where: { lobbyId_email: { lobbyId, email: normalized } },
    create: {
      lobbyId,
      email: normalized,
      magicLinkToken: token,
      magicLinkExpiresAt: expiresAt,
      magicLinkSentAt: now,
      invitedByUserId: invitedByUserId ?? null,
      invitedAt: invitedByUserId ? now : null,
    },
    update: {
      magicLinkToken: token,
      magicLinkExpiresAt: expiresAt,
      magicLinkSentAt: now,
      // Only stamp invitedBy when transitioning from nothing — keeps the
      // attribution stable across re-sends.
      ...(invitedByUserId
        ? {
            invitedByUserId,
            invitedAt: now,
          }
        : {}),
    },
  });

  return { token, expiresAt, lobbyUser };
}

export type ConsumeMagicLinkResult =
  | { ok: true; lobbyUser: LobbyUser }
  | { ok: false; reason: "not_found" | "expired" };

/**
 * Look up a row by token, validate expiry, and atomically clear the token
 * + mark the user ACTIVE. Returns the post-update row on success.
 *
 * Single-use semantics: the token field is cleared on consume, so a
 * forwarded link will return `not_found` on the second click. Callers
 * should show the visitor a "request a new link" form rather than a hard
 * error — see apps/lobby auth.request-link route in Phase 2.
 */
export async function consumeLobbyMagicLink(
  token: string,
): Promise<ConsumeMagicLinkResult> {
  if (!token) return { ok: false, reason: "not_found" };

  const row = await prisma.lobbyUser.findUnique({
    where: { magicLinkToken: token },
  });
  if (!row) return { ok: false, reason: "not_found" };

  if (!row.magicLinkExpiresAt || row.magicLinkExpiresAt.getTime() < Date.now()) {
    // Expired — drop the dead token so future lookups short-circuit.
    await prisma.lobbyUser.update({
      where: { id: row.id },
      data: {
        magicLinkToken: null,
        magicLinkExpiresAt: null,
      },
    });
    return { ok: false, reason: "expired" };
  }

  const now = new Date();
  const updated = await prisma.lobbyUser.update({
    where: { id: row.id },
    data: {
      magicLinkToken: null,
      magicLinkExpiresAt: null,
      status: "ACTIVE",
      firstLoginAt: row.firstLoginAt ?? now,
      lastSeenAt: now,
    },
  });

  return { ok: true, lobbyUser: updated };
}

/**
 * Update lastSeenAt without touching status. Called from session
 * middleware on each authenticated lobby request — cheap, but keep it on
 * the request path only when worthwhile (e.g. once per N requests).
 */
export async function touchLobbyUser(lobbyUserId: string): Promise<void> {
  await prisma.lobbyUser.update({
    where: { id: lobbyUserId },
    data: { lastSeenAt: new Date() },
  });
}
