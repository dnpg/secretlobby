import { createHmac } from "crypto";

const PREVIEW_TOKEN_EXPIRY = 60 * 60 * 1000; // 1 hour in milliseconds

/**
 * Generate a preview token for an unpublished lobby.
 * The token is signed with HMAC-SHA256 and includes an expiry timestamp.
 */
export function generatePreviewToken(lobbyId: string, accountId: string): string {
  const secret = process.env.SESSION_SECRET || "preview-secret";
  const expiry = Date.now() + PREVIEW_TOKEN_EXPIRY;
  const payload = `${lobbyId}:${accountId}:${expiry}`;

  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("hex")
    .slice(0, 16); // Use first 16 chars for shorter URL

  // Encode as base64url for URL safety
  const token = Buffer.from(`${payload}:${signature}`).toString("base64url");
  return token;
}

/**
 * Validate a preview token and extract the lobbyId and accountId.
 * Returns null if the token is invalid or expired.
 */
export function validatePreviewToken(token: string): { lobbyId: string; accountId: string } | null {
  try {
    const secret = process.env.SESSION_SECRET || "preview-secret";
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const parts = decoded.split(":");

    if (parts.length !== 4) {
      return null;
    }

    const [lobbyId, accountId, expiryStr, signature] = parts;
    const expiry = parseInt(expiryStr, 10);

    // Check if token has expired
    if (Date.now() > expiry) {
      return null;
    }

    // Verify signature
    const payload = `${lobbyId}:${accountId}:${expiryStr}`;
    const expectedSignature = createHmac("sha256", secret)
      .update(payload)
      .digest("hex")
      .slice(0, 16);

    if (signature !== expectedSignature) {
      return null;
    }

    return { lobbyId, accountId };
  } catch {
    return null;
  }
}
