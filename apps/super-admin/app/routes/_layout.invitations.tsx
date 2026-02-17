import { useLoaderData, Form, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/_layout.invitations";
import { useState } from "react";
import { toast } from "sonner";

export function meta() {
  return [{ title: "Invitations - Super Admin" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { getSession, requireAdminRole } = await import("@secretlobby/auth");
  const { getInvitationsWithPagination, getInvitationStats } = await import(
    "~/models/invitations/queries.server"
  );

  const { session } = await getSession(request);
  requireAdminRole(session);

  const url = new URL(request.url);
  const filter = (url.searchParams.get("filter") || "all") as "all" | "pending" | "used" | "expired" | "revoked";
  const page = parseInt(url.searchParams.get("page") || "1", 10);

  const [data, stats] = await Promise.all([
    getInvitationsWithPagination({ filter, page, pageSize: 50 }),
    getInvitationStats(),
  ]);

  const consoleUrl = process.env.CONSOLE_URL || "https://console.secretlobby.co";

  return {
    invitations: data.invitations,
    pagination: data.pagination,
    stats: stats.invitations,
    filter,
    consoleUrl,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { getSession, requireAdminRole } = await import("@secretlobby/auth");
  const { createInvitation, resendInvitation, revokeInvitation } = await import(
    "~/models/invitations/mutations.server"
  );

  const { session } = await getSession(request);
  requireAdminRole(session);

  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    if (intent === "create") {
      const email = formData.get("email") as string;
      const note = formData.get("note") as string;

      if (!email || !email.trim()) {
        return { error: "Email is required" };
      }

      const result = await createInvitation({
        email,
        sentBy: session.userId!,
        note: note || undefined,
      });
      return { success: `Invitation sent to ${email}`, inviteUrl: result.inviteUrl };
    }

    if (intent === "resend") {
      const id = formData.get("id") as string;
      const result = await resendInvitation(id, session.userId!);
      return { success: "Invitation resent successfully", inviteUrl: result.inviteUrl };
    }

    if (intent === "revoke") {
      const id = formData.get("id") as string;
      await revokeInvitation(id);
      return { success: "Invitation revoked" };
    }

    return { error: "Invalid action" };
  } catch (error: any) {
    return { error: error.message || "Action failed" };
  }
}

export default function InvitationsPage() {
  const { invitations, pagination, stats, filter, consoleUrl } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filters = [
    { value: "all", label: "All", count: stats.total },
    { value: "pending", label: "Pending", count: stats.pending },
    { value: "used", label: "Used", count: stats.used },
    { value: "expired", label: "Expired", count: stats.expired },
    { value: "revoked", label: "Revoked", count: stats.revoked },
  ];

  const copyInviteLink = async (code: string, id: string) => {
    const link = `${consoleUrl}/signup?code=${code}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(id);
      toast.success("Invite link copied to clipboard");
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      // Fallback for browsers that don't support clipboard API
      const textArea = document.createElement("textarea");
      textArea.value = link;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand("copy");
        setCopiedId(id);
        toast.success("Invite link copied to clipboard");
        setTimeout(() => setCopiedId(null), 2000);
      } catch {
        toast.error("Failed to copy link. Please copy manually: " + link);
      }
      document.body.removeChild(textArea);
    }
  };

  const now = new Date();

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-2">Invitations</h2>
            <p className="text-theme-secondary text-sm">
              Manage invite links for prelaunch access
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-4 py-2 btn-primary rounded-lg cursor-pointer"
          >
            {showCreateForm ? "Close" : "Create Invitation"}
          </button>
        </div>

        {actionData?.success && (
          <div className="bg-green-900/30 border border-green-700 text-green-400 px-4 py-3 rounded-lg">
            {actionData.success}
            {actionData.inviteUrl && (
              <div className="mt-2">
                <span className="text-theme-secondary text-sm">Link: </span>
                <code className="text-xs bg-theme-tertiary px-2 py-1 rounded">{actionData.inviteUrl}</code>
              </div>
            )}
          </div>
        )}
        {actionData?.error && (
          <div className="bg-red-900/30 border border-red-700 text-red-400 px-4 py-3 rounded-lg">
            {actionData.error}
          </div>
        )}

        {/* Create Form */}
        {showCreateForm && (
          <div className="card p-6">
            <h3 className="text-xl font-semibold mb-4">Create New Invitation</h3>
            <Form method="post" className="space-y-4">
              <input type="hidden" name="intent" value="create" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    name="email"
                    required
                    placeholder="user@example.com"
                    className="w-full px-3 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-2">
                    Note (optional)
                  </label>
                  <input
                    type="text"
                    name="note"
                    placeholder="VIP user, early supporter, etc."
                    className="w-full px-3 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2 btn-primary rounded-lg disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Creating..." : "Create & Send Invitation"}
              </button>
            </Form>
          </div>
        )}

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <StatCard title="Total" value={stats.total} />
          <StatCard title="Pending" value={stats.pending} variant="warning" />
          <StatCard title="Used" value={stats.used} variant="success" />
          <StatCard title="Expired" value={stats.expired} />
          <StatCard title="Revoked" value={stats.revoked} />
        </div>

        {/* Filter and Table */}
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-theme flex items-center justify-between">
            <h3 className="text-xl font-semibold">Invitations</h3>
            <div className="flex gap-2">
              {filters.map((f) => (
                <a
                  key={f.value}
                  href={`?filter=${f.value}`}
                  className={`px-3 py-1.5 text-sm font-medium rounded transition cursor-pointer ${
                    filter === f.value
                      ? "bg-(--color-brand-red) text-white"
                      : "bg-theme-tertiary text-theme-primary hover:bg-theme-secondary"
                  }`}
                >
                  {f.label} ({f.count})
                </a>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="table-theme">
              <thead>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">Sent</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">Expires</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">Used</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">Note</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invitations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-theme-secondary">
                      No invitations found
                    </td>
                  </tr>
                ) : (
                  invitations.map((invitation) => {
                    const isExpired = invitation.status === "PENDING" && new Date(invitation.expiresAt) <= now;
                    const effectiveStatus = isExpired ? "EXPIRED" : invitation.status;

                    return (
                      <tr key={invitation.id} className="hover:bg-theme-hover">
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{invitation.email}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <StatusBadge status={effectiveStatus} />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-theme-secondary">
                          {invitation.sentAt ? new Date(invitation.sentAt).toLocaleDateString() : "-"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-theme-secondary">
                          {new Date(invitation.expiresAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-theme-secondary">
                          {invitation.usedAt ? new Date(invitation.usedAt).toLocaleDateString() : "-"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-theme-secondary">
                          {invitation.note || "-"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex gap-2">
                            {(effectiveStatus === "PENDING" || effectiveStatus === "EXPIRED") && (
                              <>
                                <button
                                  onClick={() => copyInviteLink(invitation.code, invitation.id)}
                                  className="text-sm link-primary cursor-pointer"
                                >
                                  {copiedId === invitation.id ? "Copied!" : "Copy Link"}
                                </button>
                                <Form method="post" className="inline">
                                  <input type="hidden" name="intent" value="resend" />
                                  <input type="hidden" name="id" value={invitation.id} />
                                  <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="text-sm text-yellow-400 hover:text-yellow-300 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    Resend
                                  </button>
                                </Form>
                                <Form method="post" className="inline">
                                  <input type="hidden" name="intent" value="revoke" />
                                  <input type="hidden" name="id" value={invitation.id} />
                                  <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="text-sm text-red-400 hover:text-red-300 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    Revoke
                                  </button>
                                </Form>
                              </>
                            )}
                            {effectiveStatus === "USED" && (
                              <span className="text-sm text-theme-muted">-</span>
                            )}
                            {effectiveStatus === "REVOKED" && (
                              <Form method="post" className="inline">
                                <input type="hidden" name="intent" value="resend" />
                                <input type="hidden" name="id" value={invitation.id} />
                                <button
                                  type="submit"
                                  disabled={isSubmitting}
                                  className="text-sm link-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Re-invite
                                </button>
                              </Form>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <Pagination pagination={pagination} filter={filter} />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  variant = "default",
}: {
  title: string;
  value: number;
  variant?: "default" | "warning" | "success";
}) {
  const colors = {
    default: "bg-theme-card border-theme",
    warning: "bg-yellow-900/20 border-yellow-700",
    success: "bg-green-900/20 border-green-700",
  };

  return (
    <div className={`rounded-xl p-6 border ${colors[variant]}`}>
      <h3 className="text-theme-secondary text-sm font-medium uppercase tracking-wider">{title}</h3>
      <p className="text-4xl font-bold mt-2">{value.toLocaleString()}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PENDING: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800",
    USED: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800",
    EXPIRED: "bg-theme-tertiary text-theme-primary border-theme",
    REVOKED: "bg-theme-tertiary text-theme-primary border-theme",
  };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded border ${colors[status] || colors.PENDING}`}>
      {status}
    </span>
  );
}

function Pagination({ pagination, filter }: { pagination: any; filter: string }) {
  if (pagination.totalPages <= 1) return null;

  const currentPage = pagination.page;
  const totalPages = pagination.totalPages;

  const pages: (number | string)[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push("...");
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push("...");
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
        {currentPage > 1 ? (
          <a href={`?filter=${filter}&page=${currentPage - 1}`} className="px-3 py-1 text-sm bg-theme-tertiary text-theme-primary rounded hover:bg-theme-secondary transition">
            Previous
          </a>
        ) : (
          <span className="px-3 py-1 text-sm bg-theme-card text-theme-muted rounded cursor-not-allowed">Previous</span>
        )}

        {pages.map((page, index) =>
          typeof page === "number" ? (
            <a
              key={index}
              href={`?filter=${filter}&page=${page}`}
              className={`px-3 py-1 text-sm rounded transition ${
                currentPage === page
                  ? "bg-(--color-brand-red) text-white"
                  : "bg-theme-tertiary text-theme-primary hover:bg-theme-secondary"
              }`}
            >
              {page}
            </a>
          ) : (
            <span key={index} className="px-3 py-1 text-sm text-theme-muted">{page}</span>
          )
        )}

        {currentPage < totalPages ? (
          <a href={`?filter=${filter}&page=${currentPage + 1}`} className="px-3 py-1 text-sm bg-theme-tertiary text-theme-primary rounded hover:bg-theme-secondary transition">
            Next
          </a>
        ) : (
          <span className="px-3 py-1 text-sm bg-theme-card text-theme-muted rounded cursor-not-allowed">Next</span>
        )}
      </div>
    </div>
  );
}
