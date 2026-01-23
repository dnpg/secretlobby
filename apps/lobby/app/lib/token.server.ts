import { createHmac, randomBytes } from "crypto";

const SECRET = process.env.SESSION_SECRET || "fallback-secret";
const TOKEN_EXPIRY_MS = 60 * 1000; // Tokens expire after 60 seconds
const PRELOAD_TOKEN_EXPIRY_MS = 5 * 60 * 1000; // Preload tokens expire after 5 minutes

interface TokenData {
  filename: string;
  timestamp: number;
  nonce: string;
}

export function generateStreamToken(filename: string): string {
  const data: TokenData = {
    filename,
    timestamp: Date.now(),
    nonce: randomBytes(8).toString("hex"),
  };

  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  const signature = createHmac("sha256", SECRET)
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}

export function verifyStreamToken(
  token: string,
  expectedFilename: string
): { valid: boolean; error?: string } {
  try {
    const [payload, signature] = token.split(".");
    if (!payload || !signature) {
      return { valid: false, error: "Invalid token format" };
    }

    // Verify signature
    const expectedSignature = createHmac("sha256", SECRET)
      .update(payload)
      .digest("base64url");

    if (signature !== expectedSignature) {
      return { valid: false, error: "Invalid signature" };
    }

    // Decode and validate payload
    const data: TokenData = JSON.parse(
      Buffer.from(payload, "base64url").toString()
    );

    // Check expiry
    if (Date.now() - data.timestamp > TOKEN_EXPIRY_MS) {
      return { valid: false, error: "Token expired" };
    }

    // Check filename matches
    if (data.filename !== expectedFilename) {
      return { valid: false, error: "Filename mismatch" };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "Token parsing failed" };
  }
}

interface PreloadTokenData {
  trackId: string;
  lobbyId: string;
  timestamp: number;
  nonce: string;
}

export function generatePreloadToken(trackId: string, lobbyId: string): string {
  const data: PreloadTokenData = {
    trackId,
    lobbyId,
    timestamp: Date.now(),
    nonce: randomBytes(8).toString("hex"),
  };

  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  const signature = createHmac("sha256", SECRET)
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}

export function verifyPreloadToken(
  token: string,
  expectedTrackId: string,
  expectedLobbyId: string
): { valid: boolean; error?: string } {
  try {
    const [payload, signature] = token.split(".");
    if (!payload || !signature) {
      return { valid: false, error: "Invalid token format" };
    }

    const expectedSignature = createHmac("sha256", SECRET)
      .update(payload)
      .digest("base64url");

    if (signature !== expectedSignature) {
      return { valid: false, error: "Invalid signature" };
    }

    const data: PreloadTokenData = JSON.parse(
      Buffer.from(payload, "base64url").toString()
    );

    if (Date.now() - data.timestamp > PRELOAD_TOKEN_EXPIRY_MS) {
      return { valid: false, error: "Token expired" };
    }

    if (data.trackId !== expectedTrackId) {
      return { valid: false, error: "Track ID mismatch" };
    }

    if (data.lobbyId !== expectedLobbyId) {
      return { valid: false, error: "Lobby ID mismatch" };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "Token parsing failed" };
  }
}
