import { useLoaderData, Form, Link } from "react-router";
import type { Route } from "./+types/_layout.security";
import { useState } from "react";

/**
 * Get violation lockout schedule label based on violation count
 */
function getLockoutScheduleLabel(violationCount: number): string {
  if (violationCount >= 10) return "Permanent Block (10+)";
  if (violationCount >= 5) return "7 Days (5-9)";
  if (violationCount === 4) return "24 Hours (4th)";
  if (violationCount === 3) return "4 Hours (3rd)";
  if (violationCount === 2) return "1 Hour (2nd)";
  if (violationCount === 1) return "15 Minutes (1st)";
  return "Unknown";
}

export function meta() {
  return [{ title: "Security & Violations - Super Admin" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { getSession, requireAdminRole } = await import("@secretlobby/auth");
  const {
    getViolations,
    getBlockedIPs,
    getActiveLockouts,
    getSecurityStats,
    getAllAccounts,
    getUniqueIPAddresses,
    LOCKOUT_FILTERS,
  } = await import("~/models/security/queries.server");

  const { session } = await getSession(request);
  requireAdminRole(session);

  const url = new URL(request.url);
  const timeFilter = url.searchParams.get("time") || "24h";
  const lockoutFilter = url.searchParams.get("lockout") || "all";
  const ipAddress = url.searchParams.get("ip") || undefined;
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const blockedPage = parseInt(url.searchParams.get("blockedPage") || "1", 10);
  const activePage = parseInt(url.searchParams.get("activePage") || "1", 10);

  // Get all data in parallel
  const [violationsData, blockedData, activeData, stats, accounts, uniqueIPs] = await Promise.all([
    getViolations({ timeFilter, lockoutFilter, ipAddress, page, pageSize: 50 }),
    getBlockedIPs(blockedPage, 20),
    getActiveLockouts(activePage, 20),
    getSecurityStats(),
    getAllAccounts(),
    getUniqueIPAddresses(timeFilter),
  ]);

  return {
    violations: violationsData.violations,
    violationPagination: violationsData.pagination,
    blockedIPs: blockedData.blockedIPs,
    blockedPagination: blockedData.pagination,
    activeLockouts: activeData.activeLockouts,
    activePagination: activeData.pagination,
    stats24h: stats.stats24h,
    stats7d: stats.stats7d,
    timeFilter,
    lockoutFilter,
    ipAddress: ipAddress || null,
    lockoutFilters: LOCKOUT_FILTERS,
    accounts,
    uniqueIPs,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { getSession, requireAdminRole } = await import("@secretlobby/auth");
  const {
    unblockIP,
    clearViolations,
    manuallyBlockIP,
    makeBlockPermanent,
    deleteViolation,
  } = await import("~/models/security/mutations.server");

  const { session } = await getSession(request);
  requireAdminRole(session);

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  try {
    if (intent === "unblock-ip") {
      const ipAddress = formData.get("ipAddress") as string;
      return await unblockIP(ipAddress, session.userId!);
    }

    if (intent === "clear-violations") {
      const ipAddress = formData.get("ipAddress") as string;
      return await clearViolations(ipAddress, session.userId!);
    }

    if (intent === "manual-block") {
      const ipAddress = formData.get("ipAddress") as string;
      const endpoint = formData.get("endpoint") as string || "lobby-password";
      const scope = formData.get("scope") as "all" | "account";
      const permanent = formData.get("permanent") === "true";
      const reason = formData.get("reason") as string || undefined;

      // Get selected accounts
      const accountIds = formData.getAll("accountIds") as string[];

      return await manuallyBlockIP({
        ipAddress,
        endpoint,
        scope,
        accountIds,
        reason,
        permanent,
        adminUserId: session.userId!,
      });
    }

    if (intent === "make-permanent") {
      const violationId = formData.get("violationId") as string;
      return await makeBlockPermanent(violationId, session.userId!);
    }

    if (intent === "delete-violation") {
      const violationId = formData.get("violationId") as string;
      return await deleteViolation(violationId, session.userId!);
    }

    return { error: "Invalid action" };
  } catch (error: any) {
    return { error: error.message || "Action failed" };
  }
}

export default function SecurityDashboard() {
  const data = useLoaderData<typeof loader>();
  const [showManualBlockForm, setShowManualBlockForm] = useState(false);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-2">Security & Rate Limit Violations</h2>
            <p className="text-theme-secondary text-sm">
              Monitor and manage brute force protection and rate limiting
            </p>
          </div>
          <button
            onClick={() => setShowManualBlockForm(!showManualBlockForm)}
            className="px-4 py-2 btn-primary rounded-lg transition"
          >
            {showManualBlockForm ? "Close" : "Manual IP Block"}
          </button>
        </div>

        {/* Manual IP Block Form */}
        {showManualBlockForm && <ManualBlockForm accounts={data.accounts} />}

        {/* Statistics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Violations (24h)"
            value={data.stats24h.total}
            subtitle="All rate limit violations"
          />
          <StatCard
            title="Active Violations (24h)"
            value={data.stats24h.active}
            subtitle="Currently being tracked"
            variant="warning"
          />
          <StatCard
            title="Blocked IPs"
            value={data.stats24h.blocked}
            subtitle="Currently blocked"
            variant="danger"
          />
          <StatCard
            title="Violations (7d)"
            value={data.stats7d.total}
            subtitle="Last 7 days"
          />
        </div>

        {/* Top Violators */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-6">
            <h3 className="text-xl font-semibold mb-4">Top Violating IPs (24h)</h3>
            <div className="space-y-2">
              {data.stats24h.topIPs.length === 0 ? (
                <p className="text-theme-secondary text-sm">No violations in the last 24 hours</p>
              ) : (
                data.stats24h.topIPs.map((item) => (
                  <div key={item.ip} className="flex justify-between items-center p-2 hover:bg-theme-tertiary rounded">
                    <Link
                      to={`/security/${encodeURIComponent(item.ip)}`}
                      className="font-mono text-sm link-primary hover:underline"
                    >
                      {item.ip}
                    </Link>
                    <span className="text-sm font-medium">{item.count} violations</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="card p-6">
            <h3 className="text-xl font-semibold mb-4">Most Targeted Endpoints (24h)</h3>
            <div className="space-y-2">
              {data.stats24h.topEndpoints.length === 0 ? (
                <p className="text-theme-secondary text-sm">No violations in the last 24 hours</p>
              ) : (
                data.stats24h.topEndpoints.map((item, index) => (
                  <div key={`${item.endpoint}-${item.subdomain || 'all'}-${index}`} className="flex justify-between items-center p-2 hover:bg-theme-tertiary rounded">
                    <div className="flex flex-col">
                      <span className="font-mono text-sm">{item.endpoint}</span>
                      <span className="text-xs text-theme-secondary">
                        {item.subdomain ? (
                          <span className="link-primary">{item.subdomain}</span>
                        ) : (
                          <span className="text-theme-muted">All domains</span>
                        )}
                      </span>
                    </div>
                    <span className="text-sm font-medium">{item.count} attempts</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Blocked IPs */}
        {data.blockedIPs.length > 0 && (
          <BlockedIPsTable
            blockedIPs={data.blockedIPs}
            pagination={data.blockedPagination}
          />
        )}

        {/* Active Lockouts */}
        {data.activeLockouts.length > 0 && (
          <ActiveLockoutsTable
            activeLockouts={data.activeLockouts}
            pagination={data.activePagination}
          />
        )}

        {/* Recent Violations */}
        <RecentViolationsTable
          violations={data.violations}
          pagination={data.violationPagination}
          timeFilter={data.timeFilter}
          lockoutFilter={data.lockoutFilter}
          ipAddress={data.ipAddress}
          lockoutFilters={data.lockoutFilters}
          uniqueIPs={data.uniqueIPs}
        />
      </div>
    </div>
  );
}

// Component definitions follow...

/**
 * Autocomplete multi-select for accounts
 */
function AccountAutocomplete({
  accounts,
  selectedAccountIds,
  onChange,
}: {
  accounts: Array<{ id: string; name: string; slug: string }>;
  selectedAccountIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const filteredAccounts = accounts.filter(
    (account) =>
      account.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      account.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedAccounts = accounts.filter((a) => selectedAccountIds.includes(a.id));

  const toggleAccount = (accountId: string) => {
    if (selectedAccountIds.includes(accountId)) {
      onChange(selectedAccountIds.filter((id) => id !== accountId));
    } else {
      onChange([...selectedAccountIds, accountId]);
    }
  };

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-theme-secondary mb-2">
        Select Accounts
      </label>

      {/* Selected accounts pills */}
      {selectedAccounts.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selectedAccounts.map((account) => (
            <span
              key={account.id}
              className="inline-flex items-center gap-1 px-3 py-1 btn-primary rounded-full text-sm"
            >
              {account.name}
              <button
                type="button"
                onClick={() => toggleAccount(account.id)}
                className="hover:text-red-300"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search accounts..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className="w-full px-3 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-(--color-brand-red)"
        />

        {/* Dropdown */}
        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsOpen(false)}
            />
            <div className="absolute z-20 w-full mt-1 bg-theme-tertiary border border-theme rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {filteredAccounts.length === 0 ? (
                <div className="px-3 py-2 text-theme-secondary text-sm">No accounts found</div>
              ) : (
                filteredAccounts.map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => {
                      toggleAccount(account.id);
                      setSearchTerm("");
                    }}
                    className={`w-full text-left px-3 py-2 hover:bg-theme-secondary transition ${
                      selectedAccountIds.includes(account.id) ? "bg-(--color-brand-red-muted)" : ""
                    }`}
                  >
                    <div className="font-medium">{account.name}</div>
                    <div className="text-sm text-theme-secondary">{account.slug}</div>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  variant = "default",
}: {
  title: string;
  value: number;
  subtitle: string;
  variant?: "default" | "warning" | "danger";
}) {
  const colors = {
    default: "bg-theme-card border-theme",
    warning: "bg-yellow-900/20 border-yellow-700",
    danger: "bg-red-900/20 border-red-700",
  };

  return (
    <div className={`rounded-xl p-6 border ${colors[variant]}`}>
      <h3 className="text-theme-secondary text-sm font-medium uppercase tracking-wider">{title}</h3>
      <p className="text-4xl font-bold mt-2">{value.toLocaleString()}</p>
      <p className="text-sm text-theme-secondary mt-1">{subtitle}</p>
    </div>
  );
}

function ManualBlockForm({ accounts }: { accounts: Array<{ id: string; name: string; slug: string }> }) {
  const [scope, setScope] = useState<"all" | "account">("all");
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);

  return (
    <div className="card p-6">
      <h3 className="text-xl font-semibold mb-4">Manual IP Block</h3>
      <Form method="post" className="space-y-4">
        <input type="hidden" name="intent" value="manual-block" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-theme-secondary mb-2">
              IP Address *
            </label>
            <input
              type="text"
              name="ipAddress"
              required
              placeholder="192.168.1.100"
              className="w-full px-3 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-(--color-brand-red)"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-theme-secondary mb-2">
              Endpoint
            </label>
            <select
              name="endpoint"
              className="w-full px-3 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-(--color-brand-red)"
            >
              <option value="lobby-password">Lobby Password</option>
              <option value="login">Login</option>
              <option value="signup">Signup</option>
              <option value="all">All Endpoints</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-2">
            Block Scope *
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setScope("all")}
              className={`px-4 py-2 rounded-lg transition ${
                scope === "all"
                  ? "btn-primary"
                  : "bg-theme-tertiary text-theme-primary hover:bg-theme-secondary"
              }`}
            >
              All Accounts
            </button>
            <button
              type="button"
              onClick={() => setScope("account")}
              className={`px-4 py-2 rounded-lg transition ${
                scope === "account"
                  ? "btn-primary"
                  : "bg-theme-tertiary text-theme-primary hover:bg-theme-secondary"
              }`}
            >
              Specific Accounts
            </button>
          </div>
          <input type="hidden" name="scope" value={scope} />
        </div>

        {scope === "account" && (
          <div>
            <AccountAutocomplete
              accounts={accounts}
              selectedAccountIds={selectedAccounts}
              onChange={setSelectedAccounts}
            />
            {selectedAccounts.map((id) => (
              <input key={id} type="hidden" name="accountIds" value={id} />
            ))}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-2">
            Reason (optional)
          </label>
          <textarea
            name="reason"
            rows={3}
            placeholder="Reason for blocking this IP..."
            className="w-full px-3 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-(--color-brand-red)"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            name="permanent"
            value="true"
            id="permanent"
            className="w-4 h-4"
          />
          <label htmlFor="permanent" className="text-sm text-theme-secondary">
            Permanent Block (cannot be automatically resolved)
          </label>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            className="px-6 py-2 btn-primary rounded-lg transition"
          >
            Block IP Address
          </button>
        </div>
      </Form>
    </div>
  );
}

function BlockedIPsTable({
  blockedIPs,
  pagination,
}: {
  blockedIPs: any[];
  pagination: any;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="px-6 py-4 border-b border-theme flex items-center justify-between">
        <h3 className="text-xl font-semibold">Blocked IPs (Permanent)</h3>
        <span className="text-sm text-theme-secondary">
          {pagination.total} total
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="table-theme">
          <thead>
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">IP Address</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">Endpoint</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">Subdomain</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">Violations</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">Blocked Until</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {blockedIPs.map((violation) => (
              <tr key={violation.id} className="hover:bg-theme-hover">
                <td className="px-6 py-4 whitespace-nowrap font-mono text-sm">{violation.ipAddress}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-theme-secondary">{violation.endpoint}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-theme-secondary">
                  {violation.lobby ? (
                    <span className="link-primary">
                      {violation.lobby.account.slug}
                    </span>
                  ) : (
                    <span className="text-red-400">All Domains</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-theme-secondary">{violation.violationCount}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-theme-secondary">
                  {violation.lockoutUntil
                    ? new Date(violation.lockoutUntil).toLocaleString()
                    : "N/A"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <Form method="post" className="inline">
                    <input type="hidden" name="intent" value="unblock-ip" />
                    <input type="hidden" name="ipAddress" value={violation.ipAddress} />
                    <button
                      type="submit"
                      className="text-sm link-primary transition mr-3"
                    >
                      Unblock
                    </button>
                  </Form>
                  <Form method="post" className="inline">
                    <input type="hidden" name="intent" value="delete-violation" />
                    <input type="hidden" name="violationId" value={violation.id} />
                    <button
                      type="submit"
                      className="text-sm text-[var(--color-error)] hover:opacity-80 transition"
                    >
                      Delete
                    </button>
                  </Form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination pagination={pagination} pageParam="blockedPage" />
    </div>
  );
}

function ActiveLockoutsTable({
  activeLockouts,
  pagination,
}: {
  activeLockouts: any[];
  pagination: any;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="px-6 py-4 border-b border-theme flex items-center justify-between">
        <h3 className="text-xl font-semibold">Active Lockouts</h3>
        <span className="text-sm text-theme-secondary">
          {pagination.total} active
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="table-theme">
          <thead>
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">IP Address</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">Endpoint</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">Subdomain</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">Schedule</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">Lockout Until</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {activeLockouts.map((violation) => (
              <tr key={violation.id} className="hover:bg-theme-hover">
                <td className="px-6 py-4 whitespace-nowrap font-mono text-sm">{violation.ipAddress}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-theme-secondary">{violation.endpoint}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-theme-secondary">
                  {violation.lobby ? (
                    <span className="link-primary">
                      {violation.lobby.account.slug}
                    </span>
                  ) : (
                    <span className="text-theme-muted">-</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    violation.violationCount >= 5
                      ? "bg-red-900/30 text-red-400 border border-red-800"
                      : violation.violationCount >= 3
                      ? "bg-orange-900/30 text-orange-400 border border-orange-800"
                      : "bg-yellow-900/30 text-yellow-400 border border-yellow-800"
                  }`}>
                    {getLockoutScheduleLabel(violation.violationCount)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-theme-secondary">
                  {violation.lockoutUntil
                    ? new Date(violation.lockoutUntil).toLocaleString()
                    : "N/A"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap flex gap-2">
                  <Form method="post" className="inline">
                    <input type="hidden" name="intent" value="clear-violations" />
                    <input type="hidden" name="ipAddress" value={violation.ipAddress} />
                    <button
                      type="submit"
                      className="text-sm link-primary transition"
                    >
                      Clear
                    </button>
                  </Form>
                  {violation.violationCount < 10 && (
                    <Form method="post" className="inline">
                      <input type="hidden" name="intent" value="make-permanent" />
                      <input type="hidden" name="violationId" value={violation.id} />
                      <button
                        type="submit"
                        className="text-sm text-[var(--color-error)] hover:opacity-80 transition"
                      >
                        Make Permanent
                      </button>
                    </Form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination pagination={pagination} pageParam="activePage" />
    </div>
  );
}

function RecentViolationsTable({
  violations,
  pagination,
  timeFilter,
  lockoutFilter,
  ipAddress,
  lockoutFilters,
  uniqueIPs,
}: {
  violations: any[];
  pagination: any;
  timeFilter: string;
  lockoutFilter: string;
  ipAddress: string | null;
  lockoutFilters: any[];
  uniqueIPs: string[];
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [showIPDropdown, setShowIPDropdown] = useState(false);

  const filteredIPs = uniqueIPs.filter(ip =>
    ip.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const buildFilterURL = (params: Record<string, string>) => {
    const url = new URLSearchParams();
    url.set("time", params.time || timeFilter);
    url.set("lockout", params.lockout || lockoutFilter);
    if (params.ip) url.set("ip", params.ip);
    else if (ipAddress && !params.clearIP) url.set("ip", ipAddress);
    return `?${url.toString()}`;
  };

  return (
    <div className="card overflow-hidden">
      <div className="px-6 py-4 border-b border-theme">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <h3 className="text-xl font-semibold">Recent Violations</h3>

            <div className="flex flex-col sm:flex-row gap-3">
              {/* Time Filter */}
              <div className="flex gap-2">
                {[
                  { value: "1h", label: "1h" },
                  { value: "24h", label: "24h" },
                  { value: "7d", label: "7d" },
                  { value: "30d", label: "30d" },
                ].map((filter) => (
                  <a
                    key={filter.value}
                    href={buildFilterURL({ time: filter.value })}
                    className={`px-3 py-1.5 text-sm font-medium rounded transition ${
                      timeFilter === filter.value
                        ? "btn-primary"
                        : "bg-theme-tertiary text-theme-primary hover:bg-theme-secondary"
                    }`}
                  >
                    {filter.label}
                  </a>
                ))}
              </div>

              {/* Lockout Schedule Filter */}
              <select
                value={lockoutFilter}
                onChange={(e) => {
                  window.location.href = buildFilterURL({ lockout: e.target.value });
                }}
                className="px-3 py-1.5 text-sm bg-theme-tertiary border border-theme rounded text-theme-primary focus:outline-none focus:ring-2 focus:ring-(--color-brand-red)"
              >
                {lockoutFilters.map((filter) => (
                  <option key={filter.value} value={filter.value}>
                    {filter.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* IP Address Filter */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-xs">
              <input
                type="text"
                placeholder="Filter by IP address..."
                value={ipAddress || searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setShowIPDropdown(true);
                }}
                onFocus={() => setShowIPDropdown(true)}
                className="w-full px-3 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary text-sm focus:outline-none focus:ring-2 focus:ring-(--color-brand-red)"
              />

              {/* IP Dropdown */}
              {showIPDropdown && !ipAddress && searchTerm && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowIPDropdown(false)}
                  />
                  <div className="absolute z-20 w-full mt-1 bg-theme-tertiary border border-theme rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredIPs.length === 0 ? (
                      <div className="px-3 py-2 text-theme-secondary text-sm">No matching IP addresses</div>
                    ) : (
                      filteredIPs.map((ip) => (
                        <a
                          key={ip}
                          href={buildFilterURL({ ip })}
                          className="block px-3 py-2 hover:bg-theme-secondary transition font-mono text-sm"
                        >
                          {ip}
                        </a>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>

            {ipAddress && (
              <a
                href={buildFilterURL({ clearIP: "true" })}
                className="px-3 py-2 bg-theme-tertiary text-theme-primary rounded-lg hover:bg-theme-secondary transition text-sm"
              >
                Clear Filter
              </a>
            )}
          </div>

          <p className="text-sm text-theme-secondary">
            {pagination.total} violation{pagination.total !== 1 ? 's' : ''} found
            {ipAddress && <span className="ml-2">for IP: <span className="font-mono link-primary">{ipAddress}</span></span>}
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="table-theme">
          <thead>
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">Time</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">IP Address</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">Endpoint</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">Subdomain</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">Schedule</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody>
            {violations.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-theme-secondary">
                  No violations found for the selected filters
                </td>
              </tr>
            ) : (
              violations.map((violation) => (
                <tr key={violation.id} className="hover:bg-theme-hover">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-theme-secondary">
                    {new Date(violation.lastViolation).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap font-mono text-sm">
                    <Link
                      to={`/security/${encodeURIComponent(violation.ipAddress)}`}
                      className="link-primary hover:underline"
                    >
                      {violation.ipAddress}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-theme-secondary">{violation.endpoint}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-theme-secondary">
                    {violation.lobby ? (
                      <span className="link-primary">
                        {violation.lobby.account.slug}
                      </span>
                    ) : (
                      <span className="text-theme-muted">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      violation.violationCount >= 10
                        ? "bg-red-100 text-red-800 border border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
                        : violation.violationCount >= 5
                        ? "bg-orange-100 text-orange-800 border border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800"
                        : violation.violationCount >= 3
                        ? "bg-amber-100 text-amber-800 border border-amber-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800"
                        : "bg-(--color-brand-red-muted) link-primary border border-(--color-brand-red)"
                    }`}>
                      {getLockoutScheduleLabel(violation.violationCount)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded ${
                        violation.status === "BLOCKED"
                          ? "bg-red-100 text-red-800 border border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
                          : violation.status === "ACTIVE"
                          ? "bg-amber-100 text-amber-800 border border-amber-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800"
                          : violation.status === "RESOLVED"
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800"
                          : "bg-theme-tertiary text-theme-primary border border-theme"
                      }`}
                    >
                      {violation.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination pagination={pagination} pageParam="page" />
    </div>
  );
}

function Pagination({
  pagination,
  pageParam = "page",
}: {
  pagination: any;
  pageParam?: string;
}) {
  if (pagination.totalPages <= 1) return null;

  const currentPage = pagination.page;
  const totalPages = pagination.totalPages;

  // Generate page numbers to show
  const pages: (number | string)[] = [];

  if (totalPages <= 7) {
    // Show all pages if 7 or fewer
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
  } else {
    // Always show first page
    pages.push(1);

    if (currentPage > 3) {
      pages.push("...");
    }

    // Show pages around current page
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (currentPage < totalPages - 2) {
      pages.push("...");
    }

    // Always show last page
    pages.push(totalPages);
  }

  return (
    <div className="px-6 py-4 border-t border-theme flex items-center justify-between">
      <div className="text-sm text-theme-secondary">
        Showing {((currentPage - 1) * pagination.pageSize) + 1} to{" "}
        {Math.min(currentPage * pagination.pageSize, pagination.total)} of{" "}
        {pagination.total} results
      </div>

      <div className="flex gap-1">
        {/* Previous button */}
        {currentPage > 1 ? (
          <a
            href={`?${pageParam}=${currentPage - 1}`}
            className="px-3 py-1 text-sm bg-theme-tertiary text-theme-primary rounded hover:bg-theme-secondary transition"
          >
            Previous
          </a>
        ) : (
          <span className="px-3 py-1 text-sm bg-theme-card text-theme-muted rounded cursor-not-allowed">
            Previous
          </span>
        )}

        {/* Page numbers */}
        {pages.map((page, index) =>
          typeof page === "number" ? (
            <a
              key={index}
              href={`?${pageParam}=${page}`}
              className={`px-3 py-1 text-sm rounded transition ${
                currentPage === page
                  ? "btn-primary"
                  : "bg-theme-tertiary text-theme-primary hover:bg-theme-secondary"
              }`}
            >
              {page}
            </a>
          ) : (
            <span key={index} className="px-3 py-1 text-sm text-theme-muted">
              {page}
            </span>
          )
        )}

        {/* Next button */}
        {currentPage < totalPages ? (
          <a
            href={`?${pageParam}=${currentPage + 1}`}
            className="px-3 py-1 text-sm bg-theme-tertiary text-theme-primary rounded hover:bg-theme-secondary transition"
          >
            Next
          </a>
        ) : (
          <span className="px-3 py-1 text-sm bg-theme-card text-theme-muted rounded cursor-not-allowed">
            Next
          </span>
        )}
      </div>
    </div>
  );
}
