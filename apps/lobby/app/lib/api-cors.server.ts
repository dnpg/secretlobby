// =============================================================================
// CORS helper for the audio API routes (`/api/hls/...`, `/api/stream-mp3/...`).
//
// These routes are normally hit same-origin by the public lobby pages. The
// page-builder canvas in the console app needs to fetch them cross-origin
// (console.secretlobby.co → {account}.secretlobby.co), so we accept the
// console origin via CORS without opening the doors to `*` — the console
// host is the only known cross-origin caller.
// =============================================================================

/**
 * Compute the allowed console origin from env. Defaults to localhost dev so
 * the lobby app works out-of-the-box for local development.
 *
 * Env vars (in priority order):
 *   - CONSOLE_ORIGIN  — explicit origin, e.g. `https://console.secretlobby.co`
 *   - CONSOLE_URL     — existing var, may be protocol-relative; we normalize it
 *   - fallback        — `http://console.secretlobby.local` (matches `.env.example`)
 */
function getConsoleOrigin(): string {
  const explicit = process.env.CONSOLE_ORIGIN;
  if (explicit && explicit.trim()) return explicit.trim().replace(/\/+$/, "");

  const consoleUrl = process.env.CONSOLE_URL;
  if (consoleUrl && consoleUrl.trim()) {
    let url = consoleUrl.trim();
    // CONSOLE_URL may be protocol-relative (e.g. `//console.secretlobby.co`).
    // Normalize to an explicit https:// in production, http:// otherwise.
    if (url.startsWith("//")) {
      url = (process.env.NODE_ENV === "production" ? "https:" : "http:") + url;
    }
    return url.replace(/\/+$/, "");
  }

  return "http://console.secretlobby.local";
}

/**
 * Headers to include on the actual response (not the preflight) for any
 * cross-origin GET. We echo the request origin only if it matches the
 * configured console origin — otherwise no CORS headers are emitted and the
 * browser blocks the response (which is the desired default).
 */
export function corsResponseHeaders(request: Request): Record<string, string> {
  const consoleOrigin = getConsoleOrigin();
  const reqOrigin = request.headers.get("origin");
  if (!reqOrigin || reqOrigin !== consoleOrigin) return {};
  return {
    "Access-Control-Allow-Origin": consoleOrigin,
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

/**
 * True if the request is a cross-origin request from the configured console
 * origin. Lets the loaders skip the strict same-host origin check (which
 * always fails for legitimate cross-origin callers).
 */
export function isConsoleCrossOriginRequest(request: Request): boolean {
  const consoleOrigin = getConsoleOrigin();
  const reqOrigin = request.headers.get("origin");
  if (reqOrigin === consoleOrigin) return true;
  // hls.js fetches segments without an Origin header in some browsers; fall
  // back to the Referer for those cases.
  const referer = request.headers.get("referer");
  if (referer && referer.startsWith(consoleOrigin + "/")) return true;
  return false;
}

/**
 * Produce a `Response` to a CORS preflight (`OPTIONS`) for these endpoints.
 * Returns null when the request origin isn't the configured console origin
 * (the caller should then 405 or fall through).
 */
export function handleCorsPreflight(request: Request): Response | null {
  const consoleOrigin = getConsoleOrigin();
  const reqOrigin = request.headers.get("origin");
  if (!reqOrigin || reqOrigin !== consoleOrigin) return null;
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": consoleOrigin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Preview-Token",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    },
  });
}
