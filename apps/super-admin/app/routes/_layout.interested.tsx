import { useLoaderData, Form, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/_layout.interested";
import { useState } from "react";

export function meta() {
  return [{ title: "Interested People - Super Admin" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { getSession, requireAdminRole } = await import("@secretlobby/auth");
  const { getInterestedWithPagination, getInvitationStats } = await import(
    "~/models/invitations/queries.server"
  );

  const { session } = await getSession(request);
  requireAdminRole(session);

  const url = new URL(request.url);
  const filter = (url.searchParams.get("filter") || "all") as "all" | "not-invited" | "invited" | "converted";
  const page = parseInt(url.searchParams.get("page") || "1", 10);

  const [data, stats] = await Promise.all([
    getInterestedWithPagination({ filter, page, pageSize: 50 }),
    getInvitationStats(),
  ]);

  return {
    interested: data.interested,
    pagination: data.pagination,
    stats: stats.interested,
    filter,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { getSession, requireAdminRole } = await import("@secretlobby/auth");
  const { createInvitation } = await import("~/models/invitations/mutations.server");

  const { session } = await getSession(request);
  requireAdminRole(session);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "send-invite") {
    const email = formData.get("email") as string;
    const interestedPersonId = formData.get("interestedPersonId") as string;

    try {
      const result = await createInvitation({
        email,
        sentBy: session.userId!,
        interestedPersonId,
      });
      return { success: `Invitation sent to ${email}`, inviteUrl: result.inviteUrl };
    } catch (error: any) {
      return { error: error.message || "Failed to send invitation" };
    }
  }

  return { error: "Invalid action" };
}

export default function InterestedPage() {
  const { interested, pagination, stats, filter } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const filters = [
    { value: "all", label: "All", count: stats.total },
    { value: "not-invited", label: "Not Invited", count: stats.notInvited },
    { value: "invited", label: "Invited", count: stats.total - stats.notInvited - stats.converted },
    { value: "converted", label: "Converted", count: stats.converted },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-2">Interested People</h2>
            <p className="text-gray-400 text-sm">
              People who signed up for early access on the marketing site
            </p>
          </div>
        </div>

        {actionData?.success && (
          <div className="bg-green-900/30 border border-green-700 text-green-400 px-4 py-3 rounded-lg">
            {actionData.success}
          </div>
        )}
        {actionData?.error && (
          <div className="bg-red-900/30 border border-red-700 text-red-400 px-4 py-3 rounded-lg">
            {actionData.error}
          </div>
        )}

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard title="Total Signups" value={stats.total} />
          <StatCard title="Not Invited" value={stats.notInvited} variant="warning" />
          <StatCard title="Invited" value={stats.total - stats.notInvited - stats.converted} />
          <StatCard title="Converted" value={stats.converted} variant="success" />
        </div>

        {/* Filter and Table */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
            <h3 className="text-xl font-semibold">People</h3>
            <div className="flex gap-2">
              {filters.map((f) => (
                <a
                  key={f.value}
                  href={`?filter=${f.value}`}
                  className={`px-3 py-1.5 text-sm font-medium rounded transition ${
                    filter === f.value
                      ? "bg-blue-600 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  {f.label} ({f.count})
                </a>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Source</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Signed Up</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {interested.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                      No interested people found
                    </td>
                  </tr>
                ) : (
                  interested.map((person) => (
                    <tr key={person.id} className="hover:bg-gray-750">
                      <td className="px-6 py-4 whitespace-nowrap text-sm">{person.email}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                        {person.name || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                        {person.source || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                        {new Date(person.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge
                          inviteSentAt={person.inviteSentAt}
                          convertedAt={person.convertedAt}
                          invitationStatus={person.invitation?.status}
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {!person.inviteSentAt && !person.convertedAt && (
                          <Form method="post" className="inline">
                            <input type="hidden" name="intent" value="send-invite" />
                            <input type="hidden" name="email" value={person.email} />
                            <input type="hidden" name="interestedPersonId" value={person.id} />
                            <button
                              type="submit"
                              disabled={isSubmitting}
                              className="text-sm text-blue-400 hover:text-blue-300 transition disabled:opacity-50"
                            >
                              Send Invite
                            </button>
                          </Form>
                        )}
                        {person.inviteSentAt && !person.convertedAt && person.invitation && (
                          <span className="text-sm text-gray-500">Invited</span>
                        )}
                        {person.convertedAt && (
                          <span className="text-sm text-green-400">Converted</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <Pagination pagination={pagination} />
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
    default: "bg-gray-800 border-gray-700",
    warning: "bg-yellow-900/20 border-yellow-700",
    success: "bg-green-900/20 border-green-700",
  };

  return (
    <div className={`rounded-xl p-6 border ${colors[variant]}`}>
      <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider">{title}</h3>
      <p className="text-4xl font-bold mt-2">{value.toLocaleString()}</p>
    </div>
  );
}

function StatusBadge({
  inviteSentAt,
  convertedAt,
  invitationStatus,
}: {
  inviteSentAt: Date | null;
  convertedAt: Date | null;
  invitationStatus?: string;
}) {
  if (convertedAt) {
    return (
      <span className="px-2 py-1 text-xs font-medium rounded bg-green-900/30 text-green-400 border border-green-800">
        Converted
      </span>
    );
  }

  if (inviteSentAt) {
    const statusColors: Record<string, string> = {
      PENDING: "bg-yellow-900/30 text-yellow-400 border-yellow-800",
      EXPIRED: "bg-gray-700 text-gray-300 border-gray-600",
      REVOKED: "bg-gray-700 text-gray-300 border-gray-600",
    };

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded border ${statusColors[invitationStatus || "PENDING"] || statusColors.PENDING}`}>
        {invitationStatus || "Invited"}
      </span>
    );
  }

  return (
    <span className="px-2 py-1 text-xs font-medium rounded bg-gray-700 text-gray-300 border border-gray-600">
      Not Invited
    </span>
  );
}

function Pagination({ pagination }: { pagination: any }) {
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
    <div className="px-6 py-4 border-t border-gray-700 flex items-center justify-between">
      <div className="text-sm text-gray-400">
        Showing {((currentPage - 1) * pagination.pageSize) + 1} to{" "}
        {Math.min(currentPage * pagination.pageSize, pagination.total)} of{" "}
        {pagination.total} results
      </div>

      <div className="flex gap-1">
        {currentPage > 1 ? (
          <a href={`?page=${currentPage - 1}`} className="px-3 py-1 text-sm bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition">
            Previous
          </a>
        ) : (
          <span className="px-3 py-1 text-sm bg-gray-800 text-gray-500 rounded cursor-not-allowed">Previous</span>
        )}

        {pages.map((page, index) =>
          typeof page === "number" ? (
            <a
              key={index}
              href={`?page=${page}`}
              className={`px-3 py-1 text-sm rounded transition ${
                currentPage === page
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              {page}
            </a>
          ) : (
            <span key={index} className="px-3 py-1 text-sm text-gray-500">{page}</span>
          )
        )}

        {currentPage < totalPages ? (
          <a href={`?page=${currentPage + 1}`} className="px-3 py-1 text-sm bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition">
            Next
          </a>
        ) : (
          <span className="px-3 py-1 text-sm bg-gray-800 text-gray-500 rounded cursor-not-allowed">Next</span>
        )}
      </div>
    </div>
  );
}
