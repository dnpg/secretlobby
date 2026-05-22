import { prisma } from "@secretlobby/db";
import { normalizeEmail, isValidEmailShape } from "@secretlobby/auth/lobby-access";

// =============================================================================
// Lobby Access Settings
// =============================================================================

export interface UpdateLobbyAccessInput {
  accessPolicy: "PUBLIC" | "INVITE_ONLY" | "DOMAIN_ALLOWLIST";
  identityEmail: boolean;
  identityGoogle: boolean;
  passwordRequired: boolean;
  allowedDomains: string[];
}

export type UpdateLobbyAccessResult =
  | { ok: true }
  | { ok: false; error: "identity_required" | "domains_required" | "domain_invalid" };

/**
 * Save the access-control flags for a lobby. Performs the validation
 * that the schema can't (non-PUBLIC policy needs at least one identity
 * method; DOMAIN_ALLOWLIST needs at least one domain) and normalizes
 * the domain list (lowercase + trim + dedupe).
 */
export async function updateLobbyAccessSettings(
  lobbyId: string,
  input: UpdateLobbyAccessInput,
): Promise<UpdateLobbyAccessResult> {
  if (
    input.accessPolicy !== "PUBLIC" &&
    !input.identityEmail &&
    !input.identityGoogle
  ) {
    return { ok: false, error: "identity_required" };
  }

  // Normalize and validate domains. Shape: bare hostname; we don't
  // allow URLs or wildcards in v1. "Acme.com" → "acme.com" via toLower.
  const normalizedDomains = Array.from(
    new Set(
      input.allowedDomains
        .map((d) => d.trim().toLowerCase())
        .filter((d) => d.length > 0),
    ),
  );
  for (const d of normalizedDomains) {
    // Loose check — must have a dot, only allowed chars. Catches obvious
    // typos and pasted URLs without being a strict RFC parser.
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) {
      return { ok: false, error: "domain_invalid" };
    }
  }
  if (input.accessPolicy === "DOMAIN_ALLOWLIST" && normalizedDomains.length === 0) {
    return { ok: false, error: "domains_required" };
  }

  await prisma.lobby.update({
    where: { id: lobbyId },
    data: {
      accessPolicy: input.accessPolicy,
      identityEmail: input.identityEmail,
      identityGoogle: input.identityGoogle,
      passwordRequired: input.passwordRequired,
      allowedDomains: normalizedDomains,
    },
  });

  return { ok: true };
}

// =============================================================================
// Lobby Invitee Management (LobbyUser rows)
// =============================================================================

export type AddInviteeResult =
  | { ok: true; created: boolean; lobbyUserId: string }
  | { ok: false; error: "invalid_email" };

/**
 * Upsert a LobbyUser for (lobbyId, email). Existing rows are left as-is
 * apart from refreshing invitedBy/invitedAt — admins shouldn't be able
 * to flip a user back to PENDING by re-adding them, but we do want to
 * mark "yes, an admin re-vouched."
 */
export async function addLobbyInvitee(
  lobbyId: string,
  rawEmail: string,
  invitedByUserId: string,
): Promise<AddInviteeResult> {
  const email = normalizeEmail(rawEmail);
  if (!isValidEmailShape(email)) {
    return { ok: false, error: "invalid_email" };
  }

  const existing = await prisma.lobbyUser.findUnique({
    where: { lobbyId_email: { lobbyId, email } },
    select: { id: true },
  });

  if (existing) {
    await prisma.lobbyUser.update({
      where: { id: existing.id },
      data: {
        invitedByUserId,
        invitedAt: new Date(),
      },
    });
    return { ok: true, created: false, lobbyUserId: existing.id };
  }

  const created = await prisma.lobbyUser.create({
    data: {
      lobbyId,
      email,
      status: "PENDING",
      invitedByUserId,
      invitedAt: new Date(),
    },
    select: { id: true },
  });
  return { ok: true, created: true, lobbyUserId: created.id };
}

export async function removeLobbyInvitee(lobbyUserId: string, lobbyId: string) {
  // The lobbyId scope guards against an admin from one account deleting
  // a row from another (router-level auth already does, but defense in
  // depth at the data layer is cheap).
  return prisma.lobbyUser.deleteMany({
    where: { id: lobbyUserId, lobbyId },
  });
}

/**
 * Parse a textarea/textbox value into a list of unique normalized emails.
 * Accepts comma, semicolon, whitespace, or newline separators — whatever
 * a user is most likely to paste.
 */
export function parseEmailList(raw: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  const tokens = raw.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean);
  for (const t of tokens) {
    const email = normalizeEmail(t);
    if (seen.has(email)) continue;
    seen.add(email);
    if (isValidEmailShape(email)) {
      valid.push(email);
    } else {
      invalid.push(t);
    }
  }
  return { valid, invalid };
}
