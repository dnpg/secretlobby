import { useLoaderData, Link, Form } from "react-router";
import type { Route } from "./+types/_layout.security.$ipAddress";
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
              className="inline-flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded-full text-sm"
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
          className="w-full px-3 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      selectedAccountIds.includes(account.id) ? "bg-blue-900/30" : ""
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

export function meta({ params }: Route.MetaArgs) {
  return [{ title: `IP Address ${params.ipAddress} - Security - Super Admin` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { getSession, requireAdminRole, getCsrfToken } = await import("@secretlobby/auth");
  const {
    getIPViolationHistory,
    getAllAccounts,
  } = await import("~/models/security/queries.server");

  const { session } = await getSession(request);
  requireAdminRole(session);

  const ipAddress = params.ipAddress;

  const [ipHistory, accounts] = await Promise.all([
    getIPViolationHistory(ipAddress),
    getAllAccounts(),
  ]);

  const csrfToken = await getCsrfToken(request);

  return {
    ipHistory,
    accounts,
    csrfToken,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { getSession, requireAdminRole } = await import("@secretlobby/auth");
  const { csrfProtect } = await import("@secretlobby/auth/csrf");
  const {
    manuallyBlockIP,
    unblockIP,
    clearViolations,
  } = await import("~/models/security/mutations.server");

  const { session } = await getSession(request);
  requireAdminRole(session);

  // Verify CSRF token (uses HMAC validation)
  await csrfProtect(request);

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "manual-block") {
    const ipAddress = formData.get("ipAddress") as string;
    const endpoint = formData.get("endpoint") as string;
    const scope = formData.get("scope") as "all" | "account";
    const accountIds = formData.getAll("accountIds") as string[];
    const reason = formData.get("reason") as string | null;
    const permanent = formData.get("permanent") === "true";

    return await manuallyBlockIP({
      ipAddress,
      endpoint,
      scope,
      accountIds,
      reason: reason || undefined,
      permanent,
      adminUserId: session.userId!,
    });
  }

  if (intent === "unblock-ip") {
    const ipAddress = formData.get("ipAddress") as string;
    return await unblockIP(ipAddress, session.userId!);
  }

  if (intent === "clear-violations") {
    const ipAddress = formData.get("ipAddress") as string;
    return await clearViolations(ipAddress, session.userId!);
  }

  return { error: "Invalid action" };
}

export default function IPAddressDetailPage() {
  const { ipHistory, accounts, csrfToken } = useLoaderData<typeof loader>();
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [scope, setScope] = useState<"all" | "account">("all");
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Link
                to="/security"
                className="text-theme-secondary hover:text-theme-primary transition"
              >
                ← Back to Security
              </Link>
            </div>
            <h2 className="text-3xl font-bold">IP Address Details</h2>
            <p className="text-theme-secondary text-lg mt-1">
              Full violation history for{" "}
              <span className="font-mono link-primary">{ipHistory.ipAddress}</span>
            </p>
          </div>
        </div>

        {/* Summary Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card p-6">
            <div className="text-theme-secondary text-sm font-medium">Total Violations</div>
            <div className="text-3xl font-bold mt-2">{ipHistory.summary.totalViolations}</div>
          </div>
          <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-6">
            <div className="text-theme-secondary text-sm font-medium">Active</div>
            <div className="text-3xl font-bold mt-2">{ipHistory.summary.activeViolations}</div>
          </div>
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-6">
            <div className="text-theme-secondary text-sm font-medium">Blocked</div>
            <div className="text-3xl font-bold mt-2">{ipHistory.summary.blockedViolations}</div>
          </div>
          <div className="card p-6">
            <div className="text-theme-secondary text-sm font-medium">Endpoints</div>
            <div className="text-3xl font-bold mt-2">{ipHistory.summary.endpoints.length}</div>
          </div>
        </div>

        {/* Affected Accounts */}
        {ipHistory.summary.affectedAccounts.length > 0 && (
          <div className="card p-6">
            <h3 className="text-xl font-semibold mb-3">Affected Accounts</h3>
            <div className="flex flex-wrap gap-2">
              {ipHistory.summary.affectedAccounts.map((account: any) => (
                <span
                  key={account.id}
                  className="px-4 py-2 bg-theme-tertiary rounded-lg text-sm"
                >
                  {account.name} <span className="text-theme-secondary">({account.slug})</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {!showBlockForm && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Unblock IP - only show if there are active or blocked violations */}
            {(data.ipHistory.summary.activeViolations > 0 || data.ipHistory.summary.blockedViolations > 0) && (
              <Form method="post">
                <input type="hidden" name="intent" value="unblock-ip" />
                <input type="hidden" name="ipAddress" value={data.ipHistory.ipAddress} />
                <button
                  type="submit"
                  className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium"
                >
                  Unblock IP
                </button>
              </Form>
            )}

            {/* Block IP */}
            <button
              onClick={() => setShowBlockForm(true)}
              className="w-full px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium"
            >
              Block This IP Address
            </button>

            {/* Clear All Violations - always show if there are any violations */}
            {data.ipHistory.summary.totalViolations > 0 && (
              <Form method="post" onSubmit={(e) => {
                if (!confirm(`Are you sure you want to permanently delete all ${data.ipHistory.summary.totalViolations} violation records for this IP? This action cannot be undone.`)) {
                  e.preventDefault();
                }
              }}>
                <input type="hidden" name="intent" value="clear-violations" />
                <input type="hidden" name="ipAddress" value={data.ipHistory.ipAddress} />
                <button
                  type="submit"
                  className="w-full px-6 py-3 bg-theme-tertiary text-theme-primary rounded-lg hover:bg-theme-secondary transition font-medium border border-theme"
                >
                  Clear All Violations
                </button>
              </Form>
            )}
          </div>
        )}

        {/* Inline Block Form */}
        {showBlockForm && (
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">Block IP Address: {data.ipHistory.ipAddress}</h3>
              <button
                onClick={() => setShowBlockForm(false)}
                className="text-theme-secondary hover:text-theme-primary transition"
              >
                ✕
              </button>
            </div>

            <Form method="post" className="space-y-4">
              <input type="hidden" name="intent" value="manual-block" />
              <input type="hidden" name="ipAddress" value={data.ipHistory.ipAddress} />

              <div>
                <label className="block text-sm font-medium text-theme-secondary mb-2">Endpoint</label>
                <select
                  name="endpoint"
                  className="w-full px-3 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Endpoints</option>
                  {data.ipHistory.summary.endpoints.map((endpoint: string) => (
                    <option key={endpoint} value={endpoint}>
                      {endpoint}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-theme-secondary mb-2">Block Scope</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setScope("all")}
                    className={`px-4 py-2 rounded-lg transition ${
                      scope === "all" ? "bg-blue-600 text-white" : "bg-theme-tertiary text-theme-primary hover:bg-theme-secondary"
                    }`}
                  >
                    All Accounts
                  </button>
                  <button
                    type="button"
                    onClick={() => setScope("account")}
                    className={`px-4 py-2 rounded-lg transition ${
                      scope === "account" ? "bg-blue-600 text-white" : "bg-theme-tertiary text-theme-primary hover:bg-theme-secondary"
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
                    accounts={data.accounts}
                    selectedAccountIds={selectedAccounts}
                    onChange={setSelectedAccounts}
                  />
                  {selectedAccounts.map((id) => (
                    <input key={id} type="hidden" name="accountIds" value={id} />
                  ))}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-theme-secondary mb-2">Reason</label>
                <textarea
                  name="reason"
                  rows={3}
                  placeholder="Reason for blocking..."
                  className="w-full px-3 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" name="permanent" value="true" id="permanent-block" className="w-4 h-4" />
                <label htmlFor="permanent-block" className="text-sm text-theme-secondary">
                  Permanent Block
                </label>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium"
                >
                  Block IP
                </button>
                <button
                  type="button"
                  onClick={() => setShowBlockForm(false)}
                  className="px-6 py-3 bg-theme-tertiary text-theme-primary rounded-lg hover:bg-theme-secondary transition"
                >
                  Cancel
                </button>
              </div>
            </Form>
          </div>
        )}

        {/* Violation History Table */}
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-theme">
            <h3 className="text-xl font-semibold">
              Violation History ({data.ipHistory.violations.length} records)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="table-theme">
              <thead>
                <tr className="text-left text-sm text-theme-primary">
                  <th className="px-6 py-3">Endpoint</th>
                  <th className="px-6 py-3">Account/Subdomain</th>
                  <th className="px-6 py-3">Count</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Lockout Schedule</th>
                  <th className="px-6 py-3">Last Violation</th>
                </tr>
              </thead>
              <tbody>
                {data.ipHistory.violations.map((violation: any) => (
                  <tr key={violation.id} className="hover:bg-theme-hover">
                    <td className="px-6 py-4 font-mono text-sm">{violation.endpoint}</td>
                    <td className="px-6 py-4">
                      {violation.lobby?.account ? (
                        <span className="link-primary">{violation.lobby.account.slug}</span>
                      ) : (
                        <span className="text-theme-muted">All Domains</span>
                      )}
                    </td>
                    <td className="px-6 py-4">{violation.violationCount}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          violation.status === "BLOCKED"
                            ? "bg-red-900/30 text-red-300"
                            : violation.status === "ACTIVE"
                            ? "bg-yellow-900/30 text-yellow-300"
                            : violation.status === "RESOLVED"
                            ? "bg-green-900/30 text-green-300"
                            : "bg-theme-tertiary text-theme-primary"
                        }`}
                      >
                        {violation.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          violation.violationCount >= 10
                            ? "bg-red-900/30 text-red-300"
                            : violation.violationCount >= 5
                            ? "bg-orange-900/30 text-orange-300"
                            : violation.violationCount === 4
                            ? "bg-yellow-900/30 text-yellow-300"
                            : "bg-theme-tertiary text-theme-primary"
                        }`}
                      >
                        {getLockoutScheduleLabel(violation.violationCount)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-theme-secondary text-sm">
                      {new Date(violation.lastViolation).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
