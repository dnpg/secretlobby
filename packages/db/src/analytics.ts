// Aggregation queries for the analytics dashboards (super-admin overview,
// super-admin per-lobby drill-down, console per-lobby dashboard). All three
// call `getAnalyticsForPeriod` — the only difference is whether `lobbyId`
// is set.
//
// Performance notes:
//   - All COUNT(*) / COUNT(DISTINCT) casts go through `::int` so Postgres
//     returns native numbers (Prisma + JSON.stringify don't love bigint).
//   - Range filters on `occurredAt` use the AnalyticsEvent_occurredAt_idx
//     when lobbyId is null; when lobbyId is present, the composite
//     (lobbyId, eventType, occurredAt) index covers the filtered queries.
//   - Each individual aggregation is a single round-trip; we fan out with
//     Promise.all so the loader's wall-clock cost is roughly one query.

import { prisma } from "./client.js";
import { Prisma } from "./generated/client/client.js";

export interface AnalyticsPeriod {
  /** Inclusive start of the window. */
  from: Date;
  /** Exclusive end of the window. */
  to: Date;
  /** If set, all queries filter to a single lobby. */
  lobbyId?: string;
}

export interface AnalyticsSummary {
  landings: number;
  entries: number;
  plays: number;
  completes: number;
  visitors: number;
  sessions: number;
  /** entries / landings, expressed as a 0..1 ratio (NaN-safe). */
  conversion: number;
}

export interface DailyPoint {
  /** ISO date (YYYY-MM-DD) — already truncated to day in UTC. */
  date: string;
  landings: number;
  entries: number;
  plays: number;
}

export interface TopLobbyRow {
  lobbyId: string;
  lobbyName: string;
  lobbySlug: string;
  accountId: string;
  accountName: string;
  landings: number;
  entries: number;
  plays: number;
  visitors: number;
}

export interface TopCountryRow {
  countryCode: string;
  countryName: string;
  sessions: number;
  events: number;
}

export interface TopTrackRow {
  trackId: string;
  trackTitle: string;
  lobbyId: string | null;
  lobbyName: string | null;
  plays: number;
  listeners: number;
}

export interface AnalyticsForPeriod {
  period: { from: Date; to: Date; lobbyId?: string };
  summary: AnalyticsSummary;
  daily: DailyPoint[];
  topLobbies: TopLobbyRow[];
  topCountries: TopCountryRow[];
  topTracks: TopTrackRow[];
}

const regionDisplay =
  typeof Intl !== "undefined" && typeof Intl.DisplayNames !== "undefined"
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

function countryNameFor(code: string): string {
  if (!regionDisplay) return code;
  try {
    return regionDisplay.of(code) ?? code;
  } catch {
    return code;
  }
}

interface SummaryRow {
  landings: number;
  entries: number;
  plays: number;
  completes: number;
  visitors: number;
  sessions: number;
}

interface DailyRow {
  day: Date;
  landings: number;
  entries: number;
  plays: number;
}

interface TopLobbyAggRow {
  lobbyId: string;
  landings: number;
  entries: number;
  plays: number;
  visitors: number;
}

interface TopCountryAggRow {
  country: string;
  sessions: number;
  events: number;
}

interface TopTrackAggRow {
  trackId: string;
  plays: number;
  listeners: number;
}

export async function getAnalyticsForPeriod(
  period: AnalyticsPeriod,
): Promise<AnalyticsForPeriod> {
  const { from, to, lobbyId } = period;

  // Optional lobby-scope predicate, applied to every aggregation when set.
  const lobbyFilter = lobbyId
    ? Prisma.sql`AND "lobbyId" = ${lobbyId}`
    : Prisma.empty;

  const [summaryRows, dailyRows, topCountriesAgg, topTracksAgg, topLobbiesAgg] =
    await Promise.all([
      // Summary: landings and entries are DISTINCT VISITORS (not raw event
      // counts) so refreshing the password page or re-logging-in doesn't
      // inflate the funnel — one person reaching the gate or entering the
      // lobby counts as one. Plays / completes stay as raw event counts
      // because we care about play volume; per-track unique listeners are
      // surfaced separately in the Top Tracks table.
      prisma.$queryRaw<SummaryRow[]>`
        SELECT
          COUNT(DISTINCT "visitorId") FILTER (WHERE "eventType" = 'lobby_password_view')::int AS landings,
          COUNT(DISTINCT "visitorId") FILTER (WHERE "eventType" = 'login')::int AS entries,
          COUNT(*) FILTER (WHERE "eventType" = 'audio_play')::int AS plays,
          COUNT(*) FILTER (WHERE "eventType" = 'audio_complete')::int AS completes,
          COUNT(DISTINCT "visitorId")::int AS visitors,
          COUNT(DISTINCT "sessionId")::int AS sessions
        FROM "AnalyticsEvent"
        WHERE "occurredAt" >= ${from} AND "occurredAt" < ${to}
        ${lobbyFilter}
      `,

      // Daily series: distinct visitors per day for landings/entries
      // (same reasoning as the summary above — one person revisiting the
      // gate twice in a day still counts once for that day).
      prisma.$queryRaw<DailyRow[]>`
        SELECT
          DATE_TRUNC('day', "occurredAt") AS day,
          COUNT(DISTINCT "visitorId") FILTER (WHERE "eventType" = 'lobby_password_view')::int AS landings,
          COUNT(DISTINCT "visitorId") FILTER (WHERE "eventType" = 'login')::int AS entries,
          COUNT(*) FILTER (WHERE "eventType" = 'audio_play')::int AS plays
        FROM "AnalyticsEvent"
        WHERE "occurredAt" >= ${from} AND "occurredAt" < ${to}
        ${lobbyFilter}
        GROUP BY 1
        ORDER BY 1 ASC
      `,

      // Top countries by distinct session count.
      prisma.$queryRaw<TopCountryAggRow[]>`
        SELECT
          "country",
          COUNT(DISTINCT "sessionId")::int AS sessions,
          COUNT(*)::int AS events
        FROM "AnalyticsEvent"
        WHERE "occurredAt" >= ${from} AND "occurredAt" < ${to}
          AND "country" IS NOT NULL
          ${lobbyFilter}
        GROUP BY "country"
        ORDER BY sessions DESC
        LIMIT 10
      `,

      // Top tracks by play count (audio_play events only).
      prisma.$queryRaw<TopTrackAggRow[]>`
        SELECT
          "trackId",
          COUNT(*)::int AS plays,
          COUNT(DISTINCT "visitorId")::int AS listeners
        FROM "AnalyticsEvent"
        WHERE "occurredAt" >= ${from} AND "occurredAt" < ${to}
          AND "eventType" = 'audio_play'
          AND "trackId" IS NOT NULL
          ${lobbyFilter}
        GROUP BY "trackId"
        ORDER BY plays DESC
        LIMIT 10
      `,

      // Top lobbies — only meaningful for the overview. When the loader
      // already filtered to one lobbyId this just returns that one row,
      // which we drop in the overview UI when lobbyId is set.
      prisma.$queryRaw<TopLobbyAggRow[]>`
        SELECT
          "lobbyId",
          COUNT(DISTINCT "visitorId") FILTER (WHERE "eventType" = 'lobby_password_view')::int AS landings,
          COUNT(DISTINCT "visitorId") FILTER (WHERE "eventType" = 'login')::int AS entries,
          COUNT(*) FILTER (WHERE "eventType" = 'audio_play')::int AS plays,
          COUNT(DISTINCT "visitorId")::int AS visitors
        FROM "AnalyticsEvent"
        WHERE "occurredAt" >= ${from} AND "occurredAt" < ${to}
          AND "lobbyId" IS NOT NULL
          ${lobbyFilter}
        GROUP BY "lobbyId"
        ORDER BY visitors DESC
        LIMIT 10
      `,
    ]);

  const summary = summaryRows[0] ?? {
    landings: 0,
    entries: 0,
    plays: 0,
    completes: 0,
    visitors: 0,
    sessions: 0,
  };
  const conversion =
    summary.landings > 0 ? summary.entries / summary.landings : 0;

  // Enrich top-lobby rows with lobby + account names (one round-trip).
  const lobbyIds = topLobbiesAgg.map((r) => r.lobbyId);
  const lobbies = lobbyIds.length
    ? await prisma.lobby.findMany({
        where: { id: { in: lobbyIds } },
        select: {
          id: true,
          name: true,
          slug: true,
          accountId: true,
          account: { select: { id: true, name: true } },
        },
      })
    : [];
  const lobbyById = new Map(lobbies.map((l) => [l.id, l]));
  const topLobbies: TopLobbyRow[] = topLobbiesAgg.map((r) => {
    const l = lobbyById.get(r.lobbyId);
    return {
      lobbyId: r.lobbyId,
      lobbyName: l?.name ?? "(unknown lobby)",
      lobbySlug: l?.slug ?? "",
      accountId: l?.account?.id ?? "",
      accountName: l?.account?.name ?? "—",
      landings: r.landings,
      entries: r.entries,
      plays: r.plays,
      visitors: r.visitors,
    };
  });

  // Enrich top-track rows with title + lobby. Tracks can be cross-lobby
  // tied to playlists, but our trackId is unique per row.
  const trackIds = topTracksAgg.map((r) => r.trackId);
  const tracks = trackIds.length
    ? await prisma.track.findMany({
        where: { id: { in: trackIds } },
        select: {
          id: true,
          title: true,
          lobbyId: true,
          lobby: { select: { id: true, name: true } },
        },
      })
    : [];
  const trackById = new Map(tracks.map((t) => [t.id, t]));
  const topTracks: TopTrackRow[] = topTracksAgg.map((r) => {
    const t = trackById.get(r.trackId);
    return {
      trackId: r.trackId,
      trackTitle: t?.title ?? "(unknown track)",
      lobbyId: t?.lobby?.id ?? null,
      lobbyName: t?.lobby?.name ?? null,
      plays: r.plays,
      listeners: r.listeners,
    };
  });

  const topCountries: TopCountryRow[] = topCountriesAgg.map((r) => ({
    countryCode: r.country,
    countryName: countryNameFor(r.country),
    sessions: r.sessions,
    events: r.events,
  }));

  const daily: DailyPoint[] = dailyRows.map((r) => ({
    date: r.day.toISOString().slice(0, 10),
    landings: r.landings,
    entries: r.entries,
    plays: r.plays,
  }));

  return {
    period: { from, to, lobbyId },
    summary: { ...summary, conversion },
    daily,
    topLobbies,
    topCountries,
    topTracks,
  };
}

/** Convenience: window for "last N days, ending now" (UTC). */
export function lastNDaysWindow(n: number): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date(to.getTime() - n * 24 * 60 * 60 * 1000);
  return { from, to };
}
