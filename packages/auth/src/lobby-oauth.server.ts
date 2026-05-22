// Lobby OAuth handoff signing.
// -----------------------------------------------------------------------------
// When a lobby visitor signs in with Google, the OAuth round-trip happens on
// the central app/console domain (the only host registered with Google as a
// redirect URI). On success the callback needs to hand the visitor back to
// the lobby's own host so the lobby session cookie can be set against the
// right origin.
//
// That handoff carries the freshly-created LobbyUser id in a URL parameter:
//
//   https://<lobby-host>/auth/google/finish?t=<handoff>
//
// The token here is what makes that URL trustworthy. Without it, anyone
// could craft `?t=<crafted>` and sign in as another visitor. It's an HMAC-
// signed, short-lived blob:
//
//   base64url({ lobbyId, lobbyUserId, exp }).<hmac-sha256-signature>
//
// Properties:
//   - Signed with SESSION_SECRET (the same key already protecting the
//     iron-session cookies); no extra secret to manage.
//   - 60-second default TTL — long enough for the browser redirect, short
//     enough that a leaked URL doesn't grant indefinite access.
//   - Not single-use. Replay protection is by TTL only; the cost of
//     storing nonces in Redis isn't justified at this scale and HTTPS
//     prevents passive interception. Reconsider if you ever serve this
//     over plaintext.
//   - The LobbyUser row that the token names is also itself short-lived
//     in a sense — anyone consuming the handoff still has to come from
//     the right lobby host (verifyLobbyOAuthHandoff returns the lobbyId
//     embedded in the token; the consuming route checks it against the
//     resolved tenant).

import { createHmac, timingSafeEqual } from "node:crypto";
import { getSessionSecret } from "./env.server.js";

const DEFAULT_HANDOFF_TTL_MS = 60 * 1000;

interface HandoffPayload {
  lobbyId: string;
  lobbyUserId: string;
  exp: number; // ms since epoch
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64url");
}

function base64UrlDecode(str: string): Buffer {
  return Buffer.from(str, "base64url");
}

function sign(body: string): string {
  return createHmac("sha256", getSessionSecret()).update(body).digest("base64url");
}

export interface SignedHandoffInput {
  lobbyId: string;
  lobbyUserId: string;
  ttlMs?: number;
}

/**
 * Build a signed handoff blob for the callback → lobby redirect.
 *
 * Format: `<base64url(payload)>.<base64url(hmac)>`
 */
export function signLobbyOAuthHandoff({
  lobbyId,
  lobbyUserId,
  ttlMs = DEFAULT_HANDOFF_TTL_MS,
}: SignedHandoffInput): string {
  const payload: HandoffPayload = {
    lobbyId,
    lobbyUserId,
    exp: Date.now() + ttlMs,
  };
  const body = base64UrlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = sign(body);
  return `${body}.${sig}`;
}

export type VerifyHandoffResult =
  | { ok: true; lobbyId: string; lobbyUserId: string }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

/**
 * Verify a handoff token. Returns the embedded ids on success. Use the
 * `lobbyId` to confirm the token actually corresponds to the lobby the
 * visitor is currently on (the URL host) before granting a session.
 */
export function verifyLobbyOAuthHandoff(token: string): VerifyHandoffResult {
  if (!token || !token.includes(".")) {
    return { ok: false, reason: "malformed" };
  }
  const [body, sig] = token.split(".");
  if (!body || !sig) {
    return { ok: false, reason: "malformed" };
  }

  const expectedSig = sign(body);
  // Constant-time compare to avoid timing leaks on the signature.
  const expectedBuf = base64UrlDecode(expectedSig);
  const actualBuf = base64UrlDecode(sig);
  if (
    expectedBuf.length !== actualBuf.length ||
    !timingSafeEqual(expectedBuf, actualBuf)
  ) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: HandoffPayload;
  try {
    payload = JSON.parse(base64UrlDecode(body).toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (
    !payload ||
    typeof payload.lobbyId !== "string" ||
    typeof payload.lobbyUserId !== "string" ||
    typeof payload.exp !== "number"
  ) {
    return { ok: false, reason: "malformed" };
  }

  if (payload.exp < Date.now()) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, lobbyId: payload.lobbyId, lobbyUserId: payload.lobbyUserId };
}
