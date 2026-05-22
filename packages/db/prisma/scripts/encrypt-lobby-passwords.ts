/**
 * Normalize every stored lobby password under the active encryption key.
 *
 * Use this script for two distinct operations — the logic is the same:
 *
 *   1. INITIAL MIGRATION (one-time, after first deploying the encryption
 *      helpers): rewrites every legacy plaintext row as ciphertext under
 *      the active key.
 *
 *   2. KEY ROTATION (every time you flip LOBBY_PASSWORD_ACTIVE_KEY_ID to
 *      a new id): rewrites every row encrypted under any non-active key
 *      so it's encrypted under the new active key. Only after this
 *      script reports zero rows left to rewrite is it safe to remove the
 *      old LOBBY_PASSWORD_KEY_<old-id> env var.
 *
 * Run with:
 *   pnpm --filter @secretlobby/db db:encrypt-lobby-passwords
 *
 * Idempotent — re-running on already-active rows is a no-op.
 *
 * Requires LOBBY_PASSWORD_ACTIVE_KEY_ID + matching LOBBY_PASSWORD_KEY_<id>
 * env vars (see .env.example). During a rotation, the env must also
 * still contain the old LOBBY_PASSWORD_KEY_<old-id> so we can decrypt
 * legacy rows.
 */

// Reuse the package's configured Prisma singleton — it sets up the
// Prisma 7 adapter + pg pool and loads env from the workspace root, so
// the script gets the same connection the apps use.
import { prisma, disconnectDb } from "../../src/index.js";
import {
  decryptLobbyPassword,
  encryptLobbyPassword,
  getActiveKeyId,
  getEncryptedKeyId,
  isEncryptedLobbyPassword,
} from "../../../auth/src/lobby-password.server.js";

async function main() {
  // Fail fast on bad env config — better here than mid-loop.
  const activeKeyId = getActiveKeyId();
  console.log(`Active key id: ${activeKeyId}`);

  const lobbies = await prisma.lobby.findMany({
    where: { password: { not: null } },
    select: { id: true, name: true, password: true },
  });

  let rewrittenPlain = 0;
  let rewrittenRotated = 0;
  let alreadyActive = 0;
  let emptied = 0;

  for (const lobby of lobbies) {
    const current = lobby.password ?? "";
    if (current === "") {
      emptied++;
      continue;
    }

    const encryptedKeyId = getEncryptedKeyId(current);

    // Already encrypted under the active key — nothing to do.
    if (encryptedKeyId === activeKeyId) {
      alreadyActive++;
      continue;
    }

    // Either legacy plaintext (encryptedKeyId === null and the value
    // doesn't have our prefix) or encrypted under a non-active key. In
    // both cases we decrypt to plaintext and re-encrypt under the active
    // key. Legacy plaintext passes through decrypt unchanged.
    const plaintext = decryptLobbyPassword(current);
    const next = encryptLobbyPassword(plaintext);
    await prisma.lobby.update({
      where: { id: lobby.id },
      data: { password: next },
    });

    if (isEncryptedLobbyPassword(current)) {
      rewrittenRotated++;
      console.log(
        `↻ Rotated password for lobby ${lobby.id} (${lobby.name}) ` +
          `from key "${encryptedKeyId}" to "${activeKeyId}"`,
      );
    } else {
      rewrittenPlain++;
      console.log(
        `✓ Encrypted password for lobby ${lobby.id} (${lobby.name}) under key "${activeKeyId}"`,
      );
    }
  }

  console.log("");
  console.log(
    `Done. encrypted_from_plain=${rewrittenPlain}, ` +
      `rotated_under_active=${rewrittenRotated}, ` +
      `already_active=${alreadyActive}, empty=${emptied}`,
  );
  if (rewrittenRotated > 0) {
    console.log(
      "After verifying everything still authenticates, you can remove the " +
        "old LOBBY_PASSWORD_KEY_<old-id> env var on the next deploy.",
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDb();
  });
