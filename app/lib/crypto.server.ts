import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const ALGORITHM = "aes-256-gcm";
const SECRET = process.env.SESSION_SECRET || "fallback-secret";

// Generate a session-specific key from the secret and track ID
export function generateTrackKey(trackId: string, sessionNonce: string): Buffer {
  return createHash("sha256")
    .update(`${SECRET}:${trackId}:${sessionNonce}`)
    .digest();
}

// Encrypt a chunk of audio data
export function encryptChunk(
  data: Buffer,
  key: Buffer
): { encrypted: Buffer; iv: Buffer; authTag: Buffer } {
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return { encrypted, iv, authTag };
}

// Create an encrypted response with metadata
export function createEncryptedResponse(
  data: Buffer,
  key: Buffer
): Buffer {
  const { encrypted, iv, authTag } = encryptChunk(data, key);

  // Format: [iv (12 bytes)][authTag (16 bytes)][encrypted data]
  return Buffer.concat([iv, authTag, encrypted]);
}

// For client-side: export key as base64 for Web Crypto API
export function exportKeyForClient(key: Buffer): string {
  return key.toString("base64");
}
