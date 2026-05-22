// Lobby password encryption at rest.
// -----------------------------------------------------------------------------
// The lobby `password` column was historically stored as plaintext. Lobby
// passwords are *shared* secrets a band hands out to fans — the admin needs
// to retrieve and re-share them — so we can't one-way hash. Instead we
// encrypt with AES-256-GCM under a server-side key.
//
// Stored format:  enc:v1:<keyId>:<base64(iv || ciphertext || authTag)>
//
//   - `enc:v1:` prefix marks an encrypted value so legacy plaintext rows
//     pass through `decryptLobbyPassword` unchanged until the migration
//     script (packages/db/prisma/scripts/encrypt-lobby-passwords.ts) is
//     run. The prefix also leaves room to introduce v2 (e.g. envelope
//     encryption with KMS) later.
//   - `<keyId>` identifies which env var supplied the key used to
//     encrypt this row. Embedding it lets us support multiple live keys
//     during rotation: writers use the active key, readers look up
//     whichever key the row was originally encrypted under.
//   - 12-byte random IV is the GCM-recommended length; collisions are
//     astronomically unlikely so we never reuse one.
//   - 16-byte auth tag detects any tampering.
//
// Environment configuration:
//
//   LOBBY_PASSWORD_KEY_<id>            base64 of 32 random bytes per key
//                                       (one or more, e.g. _2026q2, _legacy)
//   LOBBY_PASSWORD_ACTIVE_KEY_ID       which key new writes use
//
// Rotation runbook:
//
//   1. Add LOBBY_PASSWORD_KEY_<new-id> alongside the existing key vars.
//   2. Flip LOBBY_PASSWORD_ACTIVE_KEY_ID to the new id. Deploy.
//   3. Run packages/db/prisma/scripts/encrypt-lobby-passwords.ts — it
//      walks rows encrypted under the old key, decrypts them with that
//      key (still in env), and rewrites under the active key.
//   4. Once the script reports nothing left to rotate, remove the old
//      LOBBY_PASSWORD_KEY_<old-id> from env on the next deploy.
//
// Threat covered:
//   - DB-only leak: ciphertext without the env keys is unreadable.
//   - Storage tampering: GCM rejects modified ciphertext.
//
// Threat NOT covered (out of scope):
//   - Combined DB + env leak: an attacker holding both can decrypt. At
//     that point they own the system.
//   - At-rest secrets management on the host: that's a deployment
//     concern, not this helper's. See packages/auth/src/lobby-password
//     comment in the README for the KMS upgrade path.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const PREFIX_V1 = "enc:v1:";
const KEY_BYTES = 32;
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const KEY_ENV_PATTERN = /^LOBBY_PASSWORD_KEY_([A-Za-z0-9_-]{1,32})$/;

// Deterministic test key used only when NODE_ENV === "test" so unit
// tests don't require operators to set the production env vars.
const TEST_KEY_BUF = Buffer.from(
  "test-test-test-test-test-test-test-test-test=",
  "base64",
);

interface KeyMaterial {
  keys: Map<string, Buffer>;
  activeKeyId: string;
}

let cached: KeyMaterial | null = null;

function loadKeyMaterial(): KeyMaterial {
  if (cached) return cached;

  if (process.env.NODE_ENV === "test") {
    const testKey =
      TEST_KEY_BUF.length === KEY_BYTES ? TEST_KEY_BUF : randomBytes(KEY_BYTES);
    cached = { keys: new Map([["test", testKey]]), activeKeyId: "test" };
    return cached;
  }

  const keys = new Map<string, Buffer>();
  for (const [name, raw] of Object.entries(process.env)) {
    const match = KEY_ENV_PATTERN.exec(name);
    if (!match || !raw) continue;
    const id = match[1];
    const buf = Buffer.from(raw, "base64");
    if (buf.length !== KEY_BYTES) {
      throw new Error(
        `${name} must decode to ${KEY_BYTES} bytes (got ${buf.length}). ` +
          "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
      );
    }
    keys.set(id, buf);
  }

  if (keys.size === 0) {
    throw new Error(
      "No lobby-password keys configured. Set at least one " +
        "LOBBY_PASSWORD_KEY_<id> env var (base64 of 32 random bytes) " +
        "and set LOBBY_PASSWORD_ACTIVE_KEY_ID to one of those ids. " +
        "Generate a key with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }

  const activeKeyId = process.env.LOBBY_PASSWORD_ACTIVE_KEY_ID;
  if (!activeKeyId) {
    throw new Error(
      "LOBBY_PASSWORD_ACTIVE_KEY_ID is required and must match one of the " +
        "configured LOBBY_PASSWORD_KEY_<id> env vars. " +
        `Configured ids: ${[...keys.keys()].join(", ")}`,
    );
  }
  if (!KEY_ID_PATTERN.test(activeKeyId)) {
    throw new Error(
      `LOBBY_PASSWORD_ACTIVE_KEY_ID="${activeKeyId}" is not a valid key id ` +
        "(only A-Z, a-z, 0-9, hyphen, and underscore allowed; max 32 chars).",
    );
  }
  if (!keys.has(activeKeyId)) {
    throw new Error(
      `LOBBY_PASSWORD_ACTIVE_KEY_ID="${activeKeyId}" has no matching ` +
        `LOBBY_PASSWORD_KEY_${activeKeyId} env var.`,
    );
  }

  cached = { keys, activeKeyId };
  return cached;
}

/** True when `stored` looks encrypted under the current scheme. */
export function isEncryptedLobbyPassword(stored: string): boolean {
  return stored.startsWith(PREFIX_V1);
}

/**
 * Returns the key id embedded in an encrypted value, or null if the
 * value is empty, legacy plaintext, or malformed. Used by the
 * encrypt-lobby-passwords script to decide whether a row needs to be
 * re-encrypted under a new active key during rotation.
 */
export function getEncryptedKeyId(stored: string): string | null {
  if (!isEncryptedLobbyPassword(stored)) return null;
  const remainder = stored.slice(PREFIX_V1.length);
  const sep = remainder.indexOf(":");
  if (sep <= 0) return null;
  const id = remainder.slice(0, sep);
  return KEY_ID_PATTERN.test(id) ? id : null;
}

/** The current active key id (the one used for new writes). */
export function getActiveKeyId(): string {
  return loadKeyMaterial().activeKeyId;
}

/**
 * Encrypt a lobby password for storage under the active key.
 *
 * Empty string in → empty string out, so "no password set" stays "no
 * password set" without any wrapping bytes.
 */
export function encryptLobbyPassword(plaintext: string): string {
  if (plaintext === "") return "";

  const { keys, activeKeyId } = loadKeyMaterial();
  const key = keys.get(activeKeyId);
  if (!key) {
    // Defensive — loadKeyMaterial validated this already, but the type
    // narrowing on Map.get is widen.
    throw new Error(`Active key id "${activeKeyId}" missing from key map.`);
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, ciphertext, authTag]).toString("base64");
  return `${PREFIX_V1}${activeKeyId}:${payload}`;
}

/**
 * Decrypt a stored lobby password back to plaintext.
 *
 * Legacy plaintext values (no `enc:v1:` prefix) are returned as-is so the
 * dual-read window during the initial migration doesn't break
 * authentication. After encrypt-lobby-passwords has run, every non-empty
 * stored value should be prefixed.
 *
 * Throws when a value is prefixed but malformed, references an unknown
 * key id, or fails authentication. Callers in the auth path should catch
 * via verifyLobbyPassword (which swallows errors as "wrong password")
 * rather than letting decryption faults bubble up.
 */
export function decryptLobbyPassword(stored: string): string {
  if (stored === "") return "";
  if (!isEncryptedLobbyPassword(stored)) {
    return stored;
  }

  const remainder = stored.slice(PREFIX_V1.length);
  const sep = remainder.indexOf(":");
  if (sep <= 0) {
    throw new Error(
      "Encrypted lobby password is missing key id separator. " +
        "Expected format: enc:v1:<keyId>:<base64>",
    );
  }
  const keyId = remainder.slice(0, sep);
  if (!KEY_ID_PATTERN.test(keyId)) {
    throw new Error(`Encrypted lobby password has invalid key id "${keyId}".`);
  }

  const { keys } = loadKeyMaterial();
  const key = keys.get(keyId);
  if (!key) {
    throw new Error(
      `Encrypted lobby password references unknown key id "${keyId}". ` +
        `Add LOBBY_PASSWORD_KEY_${keyId} to env to read this row, or run ` +
        "the rotation script to migrate it under the active key.",
    );
  }

  const payload = Buffer.from(remainder.slice(sep + 1), "base64");
  if (payload.length <= IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Encrypted lobby password is truncated.");
  }
  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(payload.length - AUTH_TAG_LENGTH);
  const ciphertext = payload.subarray(
    IV_LENGTH,
    payload.length - AUTH_TAG_LENGTH,
  );

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/**
 * Constant-time-ish compare of a submitted password against a stored
 * (possibly encrypted, possibly legacy plaintext) value. Returns false
 * for any decryption failure rather than throwing — the auth path
 * shouldn't 500 on a malformed value, it should reject the attempt.
 */
export function verifyLobbyPassword(submitted: string, stored: string): boolean {
  if (!stored) return false;
  try {
    const expected = decryptLobbyPassword(stored);
    if (expected.length !== submitted.length) return false;
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++) {
      mismatch |= expected.charCodeAt(i) ^ submitted.charCodeAt(i);
    }
    return mismatch === 0;
  } catch {
    return false;
  }
}
