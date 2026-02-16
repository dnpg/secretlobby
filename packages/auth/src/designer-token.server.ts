import { createHmac, randomBytes } from "crypto";

const DESIGNER_TOKEN_EXPIRY = 15 * 60 * 1000; // 15 minutes in milliseconds

export type DesignerPage = "lobby" | "login";

interface DesignerTokenPayload {
  lobbyId: string;
  accountId: string;
  page: DesignerPage;
  timestamp: number;
  nonce: string;
}

/**
 * Generate a designer token for previewing a lobby in an iframe.
 * The token is signed with HMAC-SHA256 and includes a 15-minute expiry.
 *
 * Token format: {base64url_payload}.{base64url_signature}
 */
export function generateDesignerToken(
  lobbyId: string,
  accountId: string,
  page: DesignerPage
): string {
  const secret = process.env.SESSION_SECRET || "designer-secret";
  const timestamp = Date.now();
  const nonce = randomBytes(8).toString("hex");

  const payload: DesignerTokenPayload = {
    lobbyId,
    accountId,
    page,
    timestamp,
    nonce,
  };

  const payloadStr = JSON.stringify(payload);
  const payloadBase64 = Buffer.from(payloadStr).toString("base64url");

  const signature = createHmac("sha256", secret)
    .update(payloadBase64)
    .digest("base64url");

  return `${payloadBase64}.${signature}`;
}

export interface DesignerTokenValidationResult {
  valid: boolean;
  lobbyId?: string;
  accountId?: string;
  page?: DesignerPage;
  error?: string;
}

/**
 * Validate a designer token and extract the payload.
 * Returns validation result with lobbyId, accountId, and page if valid.
 */
export function validateDesignerToken(
  token: string,
  expectedLobbyId: string,
  expectedPage: DesignerPage
): DesignerTokenValidationResult {
  try {
    const secret = process.env.SESSION_SECRET || "designer-secret";

    // Split token into payload and signature
    const parts = token.split(".");
    if (parts.length !== 2) {
      return { valid: false, error: "Invalid token format" };
    }

    const [payloadBase64, providedSignature] = parts;

    // Verify signature
    const expectedSignature = createHmac("sha256", secret)
      .update(payloadBase64)
      .digest("base64url");

    if (providedSignature !== expectedSignature) {
      return { valid: false, error: "Invalid signature" };
    }

    // Decode and parse payload
    const payloadStr = Buffer.from(payloadBase64, "base64url").toString("utf-8");
    const payload: DesignerTokenPayload = JSON.parse(payloadStr);

    // Check expiry
    const now = Date.now();
    if (now - payload.timestamp > DESIGNER_TOKEN_EXPIRY) {
      return { valid: false, error: "Token expired" };
    }

    // Verify lobbyId matches
    if (payload.lobbyId !== expectedLobbyId) {
      return { valid: false, error: "Lobby ID mismatch" };
    }

    // Verify page matches
    if (payload.page !== expectedPage) {
      return { valid: false, error: "Page type mismatch" };
    }

    return {
      valid: true,
      lobbyId: payload.lobbyId,
      accountId: payload.accountId,
      page: payload.page,
    };
  } catch {
    return { valid: false, error: "Token validation failed" };
  }
}
