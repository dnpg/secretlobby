// =============================================================================
// Lobby Users — admin route at /lobby/:lobbyId/users.
// -----------------------------------------------------------------------------
// Lists every LobbyUser (visitor) for the current lobby with pagination,
// per-row audit timestamps, and a "tracks listened" play count. Supports
// CSV and XLSX export of the full filtered list via ?format=csv|xlsx.
//
// Pagination is always server-side (Prisma take/skip) — the export endpoint
// re-enters the loader with `format` set and materializes the whole list.
//
// Auth pattern mirrors _layout.lobby.access.tsx:
//   - requireUserAuth(session)
//   - redirect to /lobbies if lobby.accountId !== session.currentAccountId
//
// Play-count attribution note: AnalyticsEvent.lobbyUserId is stamped by the
// lobby ingest path (apps/lobby/app/routes/api.event.ts) from
// session.lobbyUserIds[lobbyId]. Plays that occurred before the visitor
// authenticated (password-only or fully anonymous) are NOT counted here —
// they're attributed to a visitorId only. That's the correct trade-off
// for an admin "who listened to my stuff" view, but worth knowing when
// numbers don't line up with the analytics dashboard's session-based totals.
// =============================================================================

import { useState } from "react";
import { Form, Link, useLoaderData, useSearchParams, redirect } from "react-router";
import type { Route } from "./+types/_layout.lobby.users";
import { cn } from "@secretlobby/ui";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.lobby?.name || "Lobby"} Users — Admin` }];
}

const PAGE_SIZE = 50;
const EXPORT_FORMATS = new Set(["csv", "xlsx"]);

// Date formatting kept simple — admins know what they're looking at and a
// stable ISO date is friendlier for spreadsheet sorting than a localized
// "May 22, 2026" string. Time-of-day is omitted from the table view but
// retained in the exports (full ISO timestamp there).
function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toISOString().slice(0, 10);
}

function fmtIso(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toISOString();
}

// Minimal RFC 4180 CSV quoting: wrap in quotes when the value contains a
// comma, double-quote, CR, or LF; escape embedded double-quotes by
// doubling them.
function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : String(v);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { getSession, requireUserAuth } = await import("@secretlobby/auth");
  const { getLobbyById } = await import("~/models/queries/lobby.server");
  const { listLobbyUsers, exportLobbyUsers } = await import(
    "~/models/queries/lobby-users.server"
  );

  const { session } = await getSession(request);
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  if (!accountId) {
    throw redirect("/login");
  }

  const { lobbyId } = params;
  if (!lobbyId) {
    throw redirect("/lobbies");
  }

  const lobby = await getLobbyById(lobbyId);
  if (!lobby || lobby.accountId !== accountId) {
    throw redirect("/lobbies");
  }

  const url = new URL(request.url);
  const search = (url.searchParams.get("search") || "").trim();
  const format = url.searchParams.get("format") || "";

  // Export branch: build a Response with the right Content-Type and
  // attachment header, then bail out before the loader returns its normal
  // shape. The route component never renders for these requests.
  if (EXPORT_FORMATS.has(format)) {
    const rows = await exportLobbyUsers(lobbyId, { search });

    // Header columns kept in sync with both export formats and the table
    // view. Order chosen for spreadsheet readability: identifying fields
    // first, then audit timestamps.
    const headers = [
      "Email",
      "Status",
      "Google",
      "Invited By",
      "Invited At",
      "Magic Link Sent At",
      "First Login At",
      "Last Seen At",
      "Created At",
      "Updated At",
      "Tracks Listened",
    ];

    const safeSlug = (lobby.slug || lobbyId).replace(/[^a-z0-9_-]/gi, "");
    const dateStamp = new Date().toISOString().slice(0, 10);

    if (format === "csv") {
      const lines: string[] = [];
      lines.push(headers.map(csvEscape).join(","));
      for (const r of rows) {
        lines.push(
          [
            r.email,
            r.status,
            r.googleSub ? "Yes" : "No",
            r.invitedByEmail ?? "",
            fmtIso(r.invitedAt),
            fmtIso(r.magicLinkSentAt),
            fmtIso(r.firstLoginAt),
            fmtIso(r.lastSeenAt),
            fmtIso(r.createdAt),
            fmtIso(r.updatedAt),
            r.tracksListened,
          ]
            .map(csvEscape)
            .join(","),
        );
      }
      // Trailing CRLF so Excel/Sheets treat the final row consistently.
      const body = lines.join("\r\n") + "\r\n";
      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="lobby-users-${safeSlug}-${dateStamp}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (format === "xlsx") {
      // exceljs is large-ish — dynamic-import only on the export path so
      // the bundle for the table view stays slim.
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Lobby Users");
      sheet.addRow(headers);
      // Bold the header row; freeze it so admins scrolling 10k rows still
      // see column titles.
      sheet.getRow(1).font = { bold: true };
      sheet.views = [{ state: "frozen", ySplit: 1 }];

      for (const r of rows) {
        sheet.addRow([
          r.email,
          r.status,
          r.googleSub ? "Yes" : "No",
          r.invitedByEmail ?? "",
          r.invitedAt ?? null,
          r.magicLinkSentAt ?? null,
          r.firstLoginAt ?? null,
          r.lastSeenAt ?? null,
          r.createdAt ?? null,
          r.updatedAt ?? null,
          r.tracksListened,
        ]);
      }

      // Approximate column widths — Excel measures in "characters of the
      // default font", these are eyeballed but reasonable for the data.
      sheet.columns = [
        { width: 32 }, // email
        { width: 10 }, // status
        { width: 8 },  // google
        { width: 28 }, // invited by
        { width: 22 }, // invited at
        { width: 22 }, // magic link sent at
        { width: 22 }, // first login at
        { width: 22 }, // last seen at
        { width: 22 }, // created at
        { width: 22 }, // updated at
        { width: 14 }, // tracks listened
      ];

      const buffer = await workbook.xlsx.writeBuffer();
      // exceljs returns an ArrayBuffer-like; wrap in Uint8Array for the
      // Response body so undici/Node treat it as bytes, not JSON.
      return new Response(new Uint8Array(buffer as ArrayBuffer), {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="lobby-users-${safeSlug}-${dateStamp}.xlsx"`,
          "Cache-Control": "no-store",
        },
      });
    }
  }

  // Normal HTML branch: paginated list.
  const pageRaw = parseInt(url.searchParams.get("page") || "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const offset = (page - 1) * PAGE_SIZE;

  const { rows, total } = await listLobbyUsers(lobbyId, {
    limit: PAGE_SIZE,
    offset,
    search,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return {
    lobby: { id: lobby.id, name: lobby.name, slug: lobby.slug },
    rows,
    total,
    page,
    totalPages,
    pageSize: PAGE_SIZE,
    search,
  };
}

// Small inline icons. Keeping these here (rather than the layout's Icons
// map) avoids growing a shared symbol library for one-off glyphs.
function GoogleIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      viewBox="0 0 24 24"
      aria-label="Google"
      role="img"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.99.66-2.25 1.05-3.72 1.05-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.93l3.66-2.83z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

export default function LobbyUsersPage() {
  const { lobby, rows, total, page, totalPages, pageSize, search } =
    useLoaderData<typeof loader>();
  const [, setSearchParams] = useSearchParams();
  // Local state for the search input so typing doesn't ping the server on
  // every keystroke — submit on Enter / blur via the form.
  const [searchValue, setSearchValue] = useState(search);

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  // Build href helpers that preserve the current search query. The export
  // anchors point at the same route with ?format=…; the loader's export
  // branch picks it up and returns a download response.
  const exportHref = (fmt: "csv" | "xlsx") => {
    const params = new URLSearchParams();
    params.set("format", fmt);
    if (search) params.set("search", search);
    return `?${params.toString()}`;
  };

  const goToPage = (next: number) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("page", String(next));
      if (search) p.set("search", search);
      else p.delete("search");
      p.delete("format");
      return p;
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Users</h2>
          <p className="text-sm text-theme-secondary mt-1">
            Everyone who's signed in to <span className="font-medium">{lobby.name}</span>{" "}
            via magic link or Google. Anonymous (password-only) visitors aren't tracked here.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={exportHref("csv")}
            reloadDocument
            className="px-3 py-2 text-sm btn-secondary rounded-lg transition cursor-pointer"
          >
            Export CSV
          </Link>
          <Link
            to={exportHref("xlsx")}
            reloadDocument
            className="px-3 py-2 text-sm btn-secondary rounded-lg transition cursor-pointer"
          >
            Export XLSX
          </Link>
        </div>
      </div>

      {/* Search */}
      <Form method="get" className="flex items-center gap-2">
        <input
          type="search"
          name="search"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          placeholder="Search by email…"
          className="flex-1 max-w-md px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] text-sm"
        />
        {/* Reset page on every new search so we don't land on an empty page. */}
        <input type="hidden" name="page" value="1" />
        <button
          type="submit"
          className="px-4 py-2 text-sm btn-secondary rounded-lg transition cursor-pointer"
        >
          Search
        </button>
        {search && (
          <Link
            to="?"
            className="px-3 py-2 text-sm text-theme-muted hover:text-theme-primary transition cursor-pointer"
          >
            Clear
          </Link>
        )}
      </Form>

      {/* Table */}
      <div className="bg-theme-secondary rounded-xl border border-theme overflow-hidden">
        {rows.length === 0 ? (
          <div className="text-sm text-theme-muted py-12 text-center">
            {search
              ? `No users match "${search}".`
              : "No visitors have signed in yet."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-theme-muted bg-theme-tertiary/50">
                <tr className="border-b border-theme">
                  <th className="text-left font-medium px-4 py-3">Email</th>
                  <th className="text-left font-medium px-2 py-3">Status</th>
                  <th className="text-left font-medium px-2 py-3">Google</th>
                  <th className="text-left font-medium px-2 py-3">Invited By</th>
                  <th className="text-left font-medium px-2 py-3">Created</th>
                  <th className="text-left font-medium px-2 py-3">Updated</th>
                  <th className="text-left font-medium px-2 py-3">First Login</th>
                  <th className="text-left font-medium px-2 py-3">Last Seen</th>
                  <th className="text-right font-medium px-4 py-3">Tracks</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-theme last:border-0 hover:bg-theme-tertiary/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs break-all">
                      {r.email}
                    </td>
                    <td className="px-2 py-3">
                      <span
                        className={cn(
                          "px-2 py-0.5 text-xs rounded-full",
                          r.status === "ACTIVE"
                            ? "bg-green-500/10 text-green-400 border border-green-500/30"
                            : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/30",
                        )}
                      >
                        {r.status === "ACTIVE" ? "Active" : "Pending"}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      {r.googleSub ? (
                        <span title="Signed in with Google" className="inline-flex">
                          <GoogleIcon />
                        </span>
                      ) : (
                        <span className="text-theme-muted text-xs">—</span>
                      )}
                    </td>
                    <td className="px-2 py-3 text-xs text-theme-muted break-all">
                      {r.invitedByEmail ?? "—"}
                    </td>
                    <td className="px-2 py-3 text-xs text-theme-muted">
                      {fmtDate(r.createdAt)}
                    </td>
                    <td className="px-2 py-3 text-xs text-theme-muted">
                      {fmtDate(r.updatedAt)}
                    </td>
                    <td className="px-2 py-3 text-xs text-theme-muted">
                      {fmtDate(r.firstLoginAt)}
                    </td>
                    <td className="px-2 py-3 text-xs text-theme-muted">
                      {fmtDate(r.lastSeenAt)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.tracksListened}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm">
        <div className="text-theme-muted">
          {total === 0 ? (
            "0 results"
          ) : (
            <>
              Showing <span className="text-theme-primary font-medium">{start}</span>
              {"–"}
              <span className="text-theme-primary font-medium">{end}</span>
              {" of "}
              <span className="text-theme-primary font-medium">{total}</span>
            </>
          )}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              className={cn(
                "px-3 py-1.5 text-xs btn-secondary rounded-lg transition",
                page <= 1
                  ? "opacity-50 cursor-not-allowed"
                  : "cursor-pointer",
              )}
            >
              ← Prev
            </button>
            <span className="text-xs text-theme-muted tabular-nums">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages}
              className={cn(
                "px-3 py-1.5 text-xs btn-secondary rounded-lg transition",
                page >= totalPages
                  ? "opacity-50 cursor-not-allowed"
                  : "cursor-pointer",
              )}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
