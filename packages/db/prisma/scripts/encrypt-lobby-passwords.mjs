#!/usr/bin/env node
/**
 * Production-safe lobby password encryption script.
 * Zero TypeScript, zero devDependencies — runs with plain `node`.
 *
 *   node packages/db/prisma/scripts/encrypt-lobby-passwords.mjs
 *
 * Requires DATABASE_URL + LOBBY_PASSWORD_ACTIVE_KEY_ID +
 * LOBBY_PASSWORD_KEY_<id> in the environment.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/client/client.js";

// ---- Crypto helpers (mirrors packages/auth/src/lobby-password.server.ts) ----

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const PREFIX_V1 = "enc:v1:";
const KEY_BYTES = 32;
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const KEY_ENV_PATTERN = /^LOBBY_PASSWORD_KEY_([A-Za-z0-9_-]{1,32})$/;

function loadKeys() {
  const keys = new Map();
  for (const [name, raw] of Object.entries(process.env)) {
    const match = KEY_ENV_PATTERN.exec(name);
    if (!match || !raw) continue;
    const buf = Buffer.from(raw, "base64");
    if (buf.length !== KEY_BYTES) {
      throw new Error(`${name} must decode to ${KEY_BYTES} bytes (got ${buf.length})`);
    }
    keys.set(match[1], buf);
  }
  if (keys.size === 0) {
    throw new Error("No LOBBY_PASSWORD_KEY_<id> env vars found.");
  }
  const activeKeyId = process.env.LOBBY_PASSWORD_ACTIVE_KEY_ID;
  if (!activeKeyId || !keys.has(activeKeyId)) {
    throw new Error(
      `LOBBY_PASSWORD_ACTIVE_KEY_ID="${activeKeyId}" missing or has no matching key. ` +
        `Available: ${[...keys.keys()].join(", ")}`
    );
  }
  return { keys, activeKeyId };
}

function isEncrypted(stored) {
  return stored.startsWith(PREFIX_V1);
}

function getKeyId(stored) {
  if (!isEncrypted(stored)) return null;
  const rest = stored.slice(PREFIX_V1.length);
  const sep = rest.indexOf(":");
  if (sep <= 0) return null;
  const id = rest.slice(0, sep);
  return KEY_ID_PATTERN.test(id) ? id : null;
}

function decrypt(stored, keys) {
  if (!isEncrypted(stored)) return stored; // legacy plaintext
  const rest = stored.slice(PREFIX_V1.length);
  const sep = rest.indexOf(":");
  if (sep <= 0) throw new Error("Malformed encrypted value");
  const keyId = rest.slice(0, sep);
  const key = keys.get(keyId);
  if (!key) throw new Error(`No key for id "${keyId}"`);
  const blob = Buffer.from(rest.slice(sep + 1), "base64");
  const iv = blob.subarray(0, IV_LENGTH);
  const authTag = blob.subarray(blob.length - AUTH_TAG_LENGTH);
  const ciphertext = blob.subarray(IV_LENGTH, blob.length - AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

function encrypt(plaintext, key, keyId) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const blob = Buffer.concat([iv, encrypted, authTag]);
  return `${PREFIX_V1}${keyId}:${blob.toString("base64")}`;
}

// ---- Main ----

async function main() {
  const { keys, activeKeyId } = loadKeys();
  console.log(`Active key id: ${activeKeyId}`);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");

  const url = new URL(connectionString);
  const pool = new pg.Pool({
    host: url.hostname,
    port: parseInt(url.port || "5432"),
    database: url.pathname.slice(1),
    user: url.username,
    password: url.password,
    max: 5,
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter, log: ["error"] });

  try {
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
      if (current === "") { emptied++; continue; }

      const encKeyId = getKeyId(current);
      if (encKeyId === activeKeyId) { alreadyActive++; continue; }

      const plaintext = decrypt(current, keys);
      const next = encrypt(plaintext, keys.get(activeKeyId), activeKeyId);
      await prisma.lobby.update({
        where: { id: lobby.id },
        data: { password: next },
      });

      if (isEncrypted(current)) {
        rewrittenRotated++;
        console.log(`↻ Rotated lobby ${lobby.id} (${lobby.name}) from key "${encKeyId}" to "${activeKeyId}"`);
      } else {
        rewrittenPlain++;
        console.log(`✓ Encrypted lobby ${lobby.id} (${lobby.name}) under key "${activeKeyId}"`);
      }
    }

    console.log("");
    console.log(
      `Done. encrypted_from_plain=${rewrittenPlain}, rotated=${rewrittenRotated}, ` +
        `already_active=${alreadyActive}, empty=${emptied}`
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
