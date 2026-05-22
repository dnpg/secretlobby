import type { Route } from "./+types/api.event";
import { prisma, Prisma } from "@secretlobby/db";
import { getSession } from "@secretlobby/auth";
import {
  buildAnalyticsCookieHeaders,
  readAnalyticsCookies,
} from "~/lib/analyticsCookies.server";

// First-party analytics ingest. Receives a JSON payload from the lobby
// template's `trackEvent` helper (via navigator.sendBeacon) and writes one
// AnalyticsEvent row. The endpoint is intentionally:
//
//   - Same-origin: hit at /api/event on whatever hostname the lobby is on.
//     Cookies stay first-party; no CORS dance.
//   - Best-effort: invalid payloads, lookup failures, and DB errors all
//     respond 204 to the browser. We never block the lobby on analytics.
//   - Non-blocking: the Prisma insert is dispatched but the response ships
//     immediately so the browser's sendBeacon callback resolves fast.

interface IngestPayload {
  eventType?: unknown;
  lobbyId?: unknown;
  accountId?: unknown;
  trackId?: unknown;
  clientTs?: unknown;
  path?: unknown;
  referrer?: unknown;
  properties?: unknown;
}

const EVENT_TYPE_MAX = 80;
const PATH_MAX = 2048;
const REFERRER_MAX = 2048;
const UA_MAX = 512;

function toStr(v: unknown, max: number): string | null {
  if (typeof v !== "string" || v.length === 0) return null;
  return v.length > max ? v.slice(0, max) : v;
}

function toDate(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return new Response(null, { status: 405 });
  }

  const cookies = readAnalyticsCookies(request);
  const setCookieHeaders = buildAnalyticsCookieHeaders(cookies);

  // Parse the body. Anything malformed: short-circuit with cookies set but
  // no row written — the visitor still gets their session cookie minted.
  let payload: IngestPayload;
  try {
    payload = (await request.json()) as IngestPayload;
  } catch {
    return new Response(null, { status: 204, headers: setCookieHeaders });
  }

  const eventType = toStr(payload.eventType, EVENT_TYPE_MAX);
  if (!eventType) {
    return new Response(null, { status: 204, headers: setCookieHeaders });
  }

  const lobbyId = toStr(payload.lobbyId, 64);
  // Server-stamp accountId from the lobby record so client-supplied
  // accountId can't be spoofed across tenants. One findUnique per event;
  // cache later if volume warrants it.
  let accountId: string | null = null;
  if (lobbyId) {
    try {
      const lobby = await prisma.lobby.findUnique({
        where: { id: lobbyId },
        select: { accountId: true },
      });
      accountId = lobby?.accountId ?? null;
    } catch {
      // Lookup failure: continue with accountId null rather than drop the event.
    }
  }

  // Server-stamp lobbyUserId from the visitor's session, never trust the
  // client. session.lobbyUserIds[lobbyId] is populated when the visitor
  // completed magic-link or Google sign-in for this lobby (see
  // packages/auth/src/session.server.ts → updateLobbyAuthSession). For
  // anonymous (password-only or unauthenticated) hits this stays null.
  let lobbyUserId: string | null = null;
  if (lobbyId) {
    try {
      const { session } = await getSession(request);
      lobbyUserId = session.lobbyUserIds?.[lobbyId] ?? null;
    } catch {
      // Session decode failure (rotated key, malformed cookie): drop to
      // anonymous attribution rather than reject the event.
    }
  }

  const country = request.headers.get("cf-ipcountry") || null;
  const userAgent = toStr(request.headers.get("user-agent"), UA_MAX);
  const path = toStr(payload.path, PATH_MAX);
  const referrer = toStr(payload.referrer, REFERRER_MAX);
  const trackId = toStr(payload.trackId, 64);
  const clientTs = toDate(payload.clientTs);
  const properties: Prisma.InputJsonValue =
    payload.properties && typeof payload.properties === "object"
      ? (payload.properties as Prisma.InputJsonValue)
      : {};

  // Dispatch the insert without awaiting it on the response path. The Node
  // runtime keeps the process alive long enough to finish the write; if it
  // dies mid-write we lose the event (acceptable for telemetry of this
  // shape — at-least-once delivery isn't worth a queue at our scale yet).
  void prisma.analyticsEvent
    .create({
      data: {
        eventType,
        lobbyId,
        accountId,
        lobbyUserId,
        sessionId: cookies.sessionId,
        visitorId: cookies.visitorId,
        trackId,
        clientTs,
        path,
        referrer,
        userAgent,
        country,
        properties,
      },
    })
    .catch((err) => {
      // Surface DB failures in server logs; never to the client.
      console.error("[analytics] insert failed", err);
    });

  return new Response(null, { status: 204, headers: setCookieHeaders });
}

// Reject any non-POST hit cleanly.
export function loader() {
  return new Response(null, { status: 405 });
}
