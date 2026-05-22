// =============================================================================
// Queries for the lobby-users admin route.
// -----------------------------------------------------------------------------
// Powers the paginated list view AND the CSV/XLSX export at
// /lobby/:lobbyId/users. Kept separate from lobby-access.server.ts because
// the access page wants a narrow invitee summary while this page surfaces
// every audit timestamp plus per-row aggregate counts.
//
// Counts of audio_play events are joined manually (two-query approach) rather
// than via a Prisma include. AnalyticsEvent has no FK on LobbyUser — they
// share a string column (`AnalyticsEvent.lobbyUserId`) — so the cheapest
// shape is groupBy on the analytics table, then merge in JS.
// =============================================================================

import { prisma } from "@secretlobby/db";

export interface LobbyUserListRow {
  id: string;
  email: string;
  status: "PENDING" | "ACTIVE";
  googleSub: string | null;
  invitedByUserId: string | null;
  invitedByEmail: string | null;
  invitedAt: Date | null;
  magicLinkSentAt: Date | null;
  firstLoginAt: Date | null;
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // Number of audio_play AnalyticsEvent rows attributed to this LobbyUser
  // (i.e. logged via session.lobbyUserIds[lobbyId] at ingest time). Plays
  // made before the visitor identified themselves stay attributed to
  // visitorId only and won't appear here — that's deliberate.
  tracksListened: number;
}

interface ListOptions {
  limit?: number;
  offset?: number;
  search?: string;
}

interface ListResult {
  rows: LobbyUserListRow[];
  total: number;
}

// Internal: shared query body for both the paginated list and the export.
// `take` / `skip` come from caller — pass undefined to materialize all rows.
async function fetchLobbyUsersAndPlays(
  lobbyId: string,
  opts: { take?: number; skip?: number; search?: string },
): Promise<ListResult> {
  const where = {
    lobbyId,
    ...(opts.search
      ? {
          email: {
            contains: opts.search.trim().toLowerCase(),
            mode: "insensitive" as const,
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.lobbyUser.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: opts.take,
      skip: opts.skip,
      select: {
        id: true,
        email: true,
        status: true,
        googleSub: true,
        invitedByUserId: true,
        invitedAt: true,
        magicLinkSentAt: true,
        firstLoginAt: true,
        lastSeenAt: true,
        createdAt: true,
        updatedAt: true,
        invitedBy: { select: { email: true } },
      },
    }),
    prisma.lobbyUser.count({ where }),
  ]);

  // Bulk-fetch audio_play counts for just the LobbyUser ids on this page.
  // Scoping by both `lobbyUserId IN (…)` and `lobbyId =` keeps the planner
  // honest — the (lobbyUserId, eventType) index does the heavy lifting and
  // the lobbyId equality prunes any cross-lobby drift from a re-used id
  // that shouldn't exist anyway.
  const ids = rows.map((r) => r.id);
  const playCounts = new Map<string, number>();
  if (ids.length > 0) {
    const grouped = await prisma.analyticsEvent.groupBy({
      by: ["lobbyUserId"],
      where: {
        lobbyId,
        eventType: "audio_play",
        lobbyUserId: { in: ids },
      },
      _count: { _all: true },
    });
    for (const g of grouped) {
      if (g.lobbyUserId) playCounts.set(g.lobbyUserId, g._count._all);
    }
  }

  return {
    rows: rows.map((r) => ({
      id: r.id,
      email: r.email,
      status: r.status,
      googleSub: r.googleSub,
      invitedByUserId: r.invitedByUserId,
      invitedByEmail: r.invitedBy?.email ?? null,
      invitedAt: r.invitedAt,
      magicLinkSentAt: r.magicLinkSentAt,
      firstLoginAt: r.firstLoginAt,
      lastSeenAt: r.lastSeenAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      tracksListened: playCounts.get(r.id) ?? 0,
    })),
    total,
  };
}

/**
 * Paginated list for the table view. Default 50 per page.
 */
export async function listLobbyUsers(
  lobbyId: string,
  opts: ListOptions = {},
): Promise<ListResult> {
  return fetchLobbyUsersAndPlays(lobbyId, {
    take: opts.limit ?? 50,
    skip: opts.offset ?? 0,
    search: opts.search,
  });
}

/**
 * Full materialized list for CSV/XLSX export. Honors `search` (so the
 * export matches whatever the admin currently sees filtered) but
 * deliberately ignores pagination.
 *
 * Caller's responsibility to keep an eye on row counts — comfortable up
 * to ~10k LobbyUser rows; beyond that we'd want a streaming response.
 */
export async function exportLobbyUsers(
  lobbyId: string,
  opts: { search?: string } = {},
): Promise<LobbyUserListRow[]> {
  const { rows } = await fetchLobbyUsersAndPlays(lobbyId, {
    take: undefined,
    skip: undefined,
    search: opts.search,
  });
  return rows;
}
