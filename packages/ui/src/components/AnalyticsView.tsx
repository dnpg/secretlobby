import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalyticsForPeriod, DailyPoint } from "@secretlobby/db";

export interface AnalyticsViewProps {
  data: AnalyticsForPeriod;
  /** When true, render the Top Lobbies table (overview / super-admin only). */
  showTopLobbies: boolean;
  /**
   * Renders a lobby cell as a link. Super-admin passes a function that
   * routes to `/analytics/lobby/:id`; the console doesn't pass anything
   * (the per-lobby view is already lobby-scoped, so no internal lobby
   * links are needed). When omitted, lobby names render as plain text.
   */
  renderLobbyLink?: (lobbyId: string, label: ReactNode) => ReactNode;
  /**
   * Renders an account cell as a link. Super-admin passes a function that
   * routes to `/accounts/:id`; the console passes nothing.
   */
  renderAccountLink?: (accountId: string, label: ReactNode) => ReactNode;
}

const numberFmt = new Intl.NumberFormat("en-US");

function formatNumber(n: number) {
  return numberFmt.format(n);
}

function formatPercent(ratio: number) {
  if (!Number.isFinite(ratio)) return "—";
  return `${(ratio * 100).toFixed(1)}%`;
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="card p-6">
      <h3 className="text-theme-secondary text-sm font-medium uppercase tracking-wider">
        {label}
      </h3>
      <p className="text-4xl font-bold mt-2">{value}</p>
      {hint && <p className="text-xs text-theme-muted mt-1">{hint}</p>}
    </div>
  );
}

function DailySeriesChart({ daily }: { daily: DailyPoint[] }) {
  const empty = daily.length === 0;
  return (
    <div className="card p-6">
      <h3 className="text-theme-primary text-sm font-semibold mb-4">
        Daily activity
      </h3>
      {empty ? (
        <div className="h-64 flex items-center justify-center text-theme-muted text-sm">
          No events recorded in this period yet.
        </div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={daily} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradLandings" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradEntries" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradPlays" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ed1b2f" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#ed1b2f" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(127,127,127,0.18)" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                stroke="currentColor"
                tick={{ fontSize: 11 }}
                opacity={0.7}
              />
              <YAxis
                stroke="currentColor"
                tick={{ fontSize: 11 }}
                opacity={0.7}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--color-bg-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  color: "var(--color-text-primary)",
                  fontSize: 12,
                }}
                labelStyle={{ color: "var(--color-text-secondary)" }}
              />
              <Area
                type="monotone"
                dataKey="landings"
                name="Password-page landings"
                stroke="#6366f1"
                fill="url(#gradLandings)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="entries"
                name="Lobby entries"
                stroke="#10b981"
                fill="url(#gradEntries)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="plays"
                name="Track plays"
                stroke="#ed1b2f"
                fill="url(#gradPlays)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function TopLobbiesTable({
  rows,
  renderLobbyLink,
  renderAccountLink,
}: {
  rows: AnalyticsForPeriod["topLobbies"];
  renderLobbyLink?: AnalyticsViewProps["renderLobbyLink"];
  renderAccountLink?: AnalyticsViewProps["renderAccountLink"];
}) {
  return (
    <div className="card p-6">
      <h3 className="text-theme-primary text-sm font-semibold mb-4">
        Top lobbies
      </h3>
      {rows.length === 0 ? (
        <p className="text-theme-muted text-sm">No lobby activity in this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-theme-secondary text-xs uppercase tracking-wider">
              <tr className="border-b border-theme">
                <th className="text-left py-2 pr-4 font-medium">Lobby</th>
                <th className="text-left py-2 pr-4 font-medium">Account</th>
                <th className="text-right py-2 pr-4 font-medium">Landings</th>
                <th className="text-right py-2 pr-4 font-medium">Entries</th>
                <th className="text-right py-2 pr-4 font-medium">Conv.</th>
                <th className="text-right py-2 pr-4 font-medium">Plays</th>
                <th className="text-right py-2 font-medium">Visitors</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const conv = r.landings > 0 ? r.entries / r.landings : 0;
                const lobbyCell = renderLobbyLink
                  ? renderLobbyLink(r.lobbyId, r.lobbyName)
                  : r.lobbyName;
                const accountCell =
                  renderAccountLink && r.accountId
                    ? renderAccountLink(r.accountId, r.accountName)
                    : r.accountName;
                return (
                  <tr
                    key={r.lobbyId}
                    className="border-b border-theme last:border-0 hover:bg-theme-tertiary/40"
                  >
                    <td className="py-2 pr-4 text-theme-primary">{lobbyCell}</td>
                    <td className="py-2 pr-4 text-theme-secondary">{accountCell}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {formatNumber(r.landings)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {formatNumber(r.entries)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-theme-secondary">
                      {formatPercent(conv)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {formatNumber(r.plays)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatNumber(r.visitors)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TopCountriesTable({ rows }: { rows: AnalyticsForPeriod["topCountries"] }) {
  return (
    <div className="card p-6">
      <h3 className="text-theme-primary text-sm font-semibold mb-4">
        Top countries
      </h3>
      {rows.length === 0 ? (
        <p className="text-theme-muted text-sm">
          No country data yet — verify the lobby is behind Cloudflare (cf-ipcountry header).
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-theme-secondary text-xs uppercase tracking-wider">
            <tr className="border-b border-theme">
              <th className="text-left py-2 pr-4 font-medium">Country</th>
              <th className="text-right py-2 pr-4 font-medium">Sessions</th>
              <th className="text-right py-2 font-medium">Events</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.countryCode}
                className="border-b border-theme last:border-0"
              >
                <td className="py-2 pr-4">
                  <span className="text-theme-primary">{r.countryName}</span>
                  <span className="text-theme-muted ml-2 text-xs">
                    {r.countryCode}
                  </span>
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {formatNumber(r.sessions)}
                </td>
                <td className="py-2 text-right tabular-nums text-theme-secondary">
                  {formatNumber(r.events)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TopTracksTable({
  rows,
  showLobbyColumn,
  renderLobbyLink,
}: {
  rows: AnalyticsForPeriod["topTracks"];
  showLobbyColumn: boolean;
  renderLobbyLink?: AnalyticsViewProps["renderLobbyLink"];
}) {
  return (
    <div className="card p-6">
      <h3 className="text-theme-primary text-sm font-semibold mb-4">
        Top tracks
      </h3>
      {rows.length === 0 ? (
        <p className="text-theme-muted text-sm">No track plays in this period.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-theme-secondary text-xs uppercase tracking-wider">
            <tr className="border-b border-theme">
              <th className="text-left py-2 pr-4 font-medium">Track</th>
              {showLobbyColumn && (
                <th className="text-left py-2 pr-4 font-medium">Lobby</th>
              )}
              <th className="text-right py-2 pr-4 font-medium">Plays</th>
              <th className="text-right py-2 font-medium">Listeners</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const lobbyCell =
                r.lobbyId && renderLobbyLink
                  ? renderLobbyLink(r.lobbyId, r.lobbyName || "(unknown lobby)")
                  : r.lobbyName || "—";
              return (
                <tr
                  key={r.trackId}
                  className="border-b border-theme last:border-0"
                >
                  <td className="py-2 pr-4 text-theme-primary">{r.trackTitle}</td>
                  {showLobbyColumn && (
                    <td className="py-2 pr-4 text-theme-secondary">{lobbyCell}</td>
                  )}
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {formatNumber(r.plays)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatNumber(r.listeners)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function AnalyticsView({
  data,
  showTopLobbies,
  renderLobbyLink,
  renderAccountLink,
}: AnalyticsViewProps) {
  const { summary, daily, topLobbies, topCountries, topTracks } = data;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          label="Password landings"
          value={formatNumber(summary.landings)}
          hint="Visitors who reached the gate"
        />
        <StatCard
          label="Lobby entries"
          value={formatNumber(summary.entries)}
          hint="Visitors who passed the gate"
        />
        <StatCard
          label="Conversion"
          value={formatPercent(summary.conversion)}
          hint="entries / landings"
        />
        <StatCard
          label="Track plays"
          value={formatNumber(summary.plays)}
          hint={`${formatNumber(summary.completes)} completes`}
        />
        <StatCard
          label="Unique visitors"
          value={formatNumber(summary.visitors)}
        />
        <StatCard
          label="Sessions"
          value={formatNumber(summary.sessions)}
        />
      </div>

      <DailySeriesChart daily={daily} />

      {showTopLobbies && (
        <TopLobbiesTable
          rows={topLobbies}
          renderLobbyLink={renderLobbyLink}
          renderAccountLink={renderAccountLink}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopCountriesTable rows={topCountries} />
        <TopTracksTable
          rows={topTracks}
          showLobbyColumn={showTopLobbies}
          renderLobbyLink={renderLobbyLink}
        />
      </div>
    </div>
  );
}
