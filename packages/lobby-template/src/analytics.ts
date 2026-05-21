// =============================================================================
// trackEvent — shared lobby analytics helper.
// -----------------------------------------------------------------------------
// Dual-fires every event to TWO independent destinations:
//
//   1. The customer's own analytics (gtag / dataLayer) — unchanged behavior.
//      We do NOT replace the customer's pipeline; they keep getting their data
//      in their own GA / GTM property exactly as before.
//
//   2. SecretLobby's first-party ingest at /api/event on the same origin the
//      visitor is already on, via navigator.sendBeacon (fire-and-forget, no
//      `await`, never blocks user interaction, survives unload).
//
// Performance contract: this file must stay tiny, never import server code,
// and never `await` anything on the hot path. The browser does not need to
// hear back from /api/event for the event to be considered "tracked" — the
// beacon is queued by the browser and we keep going.
// =============================================================================

export type TrackEventParams = Record<string, unknown>;

interface AnalyticsContext {
  lobbyId: string | null;
  accountId: string | null;
  // Override the ingest endpoint — defaults to "/api/event" on the same
  // origin. Useful only for tests / staging.
  endpoint?: string;
  // When true (default), also fire to the customer's gtag/dataLayer.
  // The lobby toggles this off only in extremely unusual cases — e.g. when
  // the page deliberately suppresses third-party telemetry.
  dualFireCustomer?: boolean;
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
    __sl_analytics?: AnalyticsContext;
  }
}

const DEFAULT_ENDPOINT = "/api/event";

let contextMissingWarned = false;
function warnContextMissingOnce(): void {
  if (contextMissingWarned) return;
  contextMissingWarned = true;
  if (typeof console !== "undefined" && typeof console.warn === "function") {
    console.warn(
      "[secretlobby/analytics] trackEvent fired before setAnalyticsContext — sending unattributed beacon. Wire setAnalyticsContext({ lobbyId, accountId }) on mount.",
    );
  }
}

/**
 * Register the analytics context (lobbyId + accountId) for this page.
 * The lobby app calls this once on mount with whatever the loader returned.
 * Safe to call multiple times — the latest values win. No-op on the server.
 */
export function setAnalyticsContext(ctx: AnalyticsContext): void {
  if (typeof window === "undefined") return;
  window.__sl_analytics = {
    dualFireCustomer: true,
    ...ctx,
  };
}

/**
 * Fire a single analytics event. Returns immediately; the network send is
 * scheduled by the browser via sendBeacon (with a keepalive fetch fallback).
 *
 * Safe to call from any event handler, useEffect, or interaction path —
 * never throws, never awaits, never blocks.
 */
export function trackEvent(eventName: string, params: TrackEventParams = {}): void {
  if (typeof window === "undefined") return;

  const ctx = window.__sl_analytics;
  const dualFire = ctx?.dualFireCustomer ?? true;

  // 1) Customer's GA — unchanged.
  if (dualFire && typeof window.gtag === "function") {
    try {
      window.gtag("event", eventName, params);
    } catch {
      // Never let customer analytics break our pipeline.
    }
  }

  // 2) Customer's GTM dataLayer — unchanged.
  if (dualFire && Array.isArray(window.dataLayer)) {
    try {
      window.dataLayer.push({ event: eventName, ...params });
    } catch {
      // Same — isolate failures.
    }
  }

  // 3) Our first-party beacon. We send even when the page hasn't yet
  //    called setAnalyticsContext — better to ship an unattributed event
  //    (lobbyId/accountId null) than to silently drop telemetry because of
  //    a wiring bug. The dashboard can filter null lobbyIds out.
  if (!ctx) {
    warnContextMissingOnce();
  }

  // Lift `track_id` / `trackId` out of params into the top-level beacon
  // field — keeps the AnalyticsEvent.trackId column populated for the
  // dashboard's per-track aggregations without forcing every call site to
  // know the column name. The lifted value is removed from `properties` to
  // avoid storing the same string twice in the row.
  const liftedTrackId =
    (params["track_id"] as string | undefined) ??
    (params["trackId"] as string | undefined) ??
    null;
  let properties: TrackEventParams = params;
  if (liftedTrackId && ("track_id" in params || "trackId" in params)) {
    properties = { ...params };
    delete (properties as Record<string, unknown>)["track_id"];
    delete (properties as Record<string, unknown>)["trackId"];
  }

  const payload = {
    eventType: eventName,
    lobbyId: ctx?.lobbyId ?? null,
    accountId: ctx?.accountId ?? null,
    trackId: liftedTrackId,
    clientTs: new Date().toISOString(),
    path: window.location.pathname,
    referrer: typeof document !== "undefined" ? document.referrer || null : null,
    properties,
  };

  const endpoint = ctx?.endpoint || DEFAULT_ENDPOINT;
  const body = JSON.stringify(payload);

  try {
    let sent = false;
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      sent = navigator.sendBeacon(endpoint, blob);
    }
    if (!sent && typeof fetch === "function") {
      // keepalive lets the request outlive the page unload (up to 64KB).
      void fetch(endpoint, {
        method: "POST",
        body,
        keepalive: true,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
      }).catch(() => {
        // Beacon best-effort; we never surface ingest failures.
      });
    }
  } catch {
    // Hard isolation: analytics must never crash the lobby.
  }
}
