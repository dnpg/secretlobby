// First-party visitor/session cookies for the analytics beacon.
//
// - `sl_visitor`: long-lived (1 year), identifies the same browser across visits.
// - `sl_session`: 30-minute sliding window — refreshed by Max-Age on every ingest hit,
//   so a session naturally closes after 30 minutes of inactivity.
//
// Both are HttpOnly first-party cookies (the client never reads them). The
// browser sends them on every same-origin request to /api/event; the server
// mints them on first hit and refreshes Max-Age thereafter.

import { randomUUID } from "node:crypto";

const VISITOR_COOKIE = "sl_visitor";
const SESSION_COOKIE = "sl_session";
const VISITOR_TTL_SECONDS = 365 * 24 * 60 * 60;
const SESSION_TTL_SECONDS = 30 * 60;

export interface AnalyticsCookies {
  visitorId: string;
  sessionId: string;
  isNewVisitor: boolean;
  isNewSession: boolean;
}

function parseCookieHeader(header: string | null): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) {
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
}

export function readAnalyticsCookies(request: Request): AnalyticsCookies {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const existingVisitor = cookies[VISITOR_COOKIE];
  const existingSession = cookies[SESSION_COOKIE];

  return {
    visitorId: existingVisitor || randomUUID(),
    sessionId: existingSession || randomUUID(),
    isNewVisitor: !existingVisitor,
    isNewSession: !existingSession,
  };
}

/**
 * Build the Set-Cookie headers to refresh both cookies on the response.
 * Always call this on the ingest response — both cookies get extended each
 * time so an active visitor keeps the same session.
 */
export function buildAnalyticsCookieHeaders(cookies: AnalyticsCookies): Headers {
  const headers = new Headers();
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

  headers.append(
    "Set-Cookie",
    `${VISITOR_COOKIE}=${encodeURIComponent(cookies.visitorId)}; Path=/; Max-Age=${VISITOR_TTL_SECONDS}; HttpOnly; SameSite=Lax${secure}`,
  );
  headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(cookies.sessionId)}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; SameSite=Lax${secure}`,
  );
  return headers;
}
