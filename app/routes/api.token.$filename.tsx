import { randomBytes } from "crypto";
import type { Route } from "./+types/api.token.$filename";
import { getSession } from "~/lib/session.server";
import { generateStreamToken } from "~/lib/token.server";
import { generateTrackKey, exportKeyForClient } from "~/lib/crypto.server";

export async function loader({ request, params }: Route.LoaderArgs) {
  // Verify session
  const { session } = await getSession(request);
  if (!session.isAuthenticated && !session.isAdmin) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const trackId = params.filename; // Can be filename or trackId
  if (!trackId) {
    return Response.json({ error: "Track ID required" }, { status: 400 });
  }

  // Check origin/referer to prevent external requests
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");

  const isValidOrigin =
    origin?.includes(host || "") || referer?.includes(host || "");

  if (!isValidOrigin && process.env.NODE_ENV === "production") {
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  }

  // Generate time-limited token
  const token = generateStreamToken(trackId);

  // Generate session nonce for encryption key derivation
  const sessionNonce = randomBytes(16).toString("hex");

  // Generate the encryption key for this session
  const key = generateTrackKey(trackId, sessionNonce);
  const keyBase64 = exportKeyForClient(key);

  return Response.json(
    {
      token,
      nonce: sessionNonce,
      key: keyBase64, // Client uses this to decrypt
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
      },
    }
  );
}
