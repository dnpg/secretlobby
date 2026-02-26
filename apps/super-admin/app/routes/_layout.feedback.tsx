import { useLoaderData, useNavigate } from "react-router";
import type { Route } from "./+types/_layout.feedback";

export function meta() {
  return [{ title: "Feedback - Super Admin" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { getSession, requireAdminRole } = await import("@secretlobby/auth");
  const { getFeedbackWithPagination, getFeedbackStats } = await import(
    "~/models/feedback/queries.server"
  );

  const { session } = await getSession(request);
  requireAdminRole(session);

  const url = new URL(request.url);
  const status = (url.searchParams.get("status") || "ALL") as "ALL" | "PENDING" | "READ" | "ARCHIVED";
  const page = parseInt(url.searchParams.get("page") || "1", 10);

  const [data, stats] = await Promise.all([
    getFeedbackWithPagination({ status, page, pageSize: 20 }),
    getFeedbackStats(),
  ]);

  return {
    feedback: data.feedback,
    pagination: data.pagination,
    stats,
    status,
  };
}

export default function FeedbackPage() {
  const { feedback, pagination, stats, status } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const filters = [
    { value: "ALL", label: "All", count: stats.total },
    { value: "PENDING", label: "Pending", count: stats.pending },
    { value: "READ", label: "Read", count: stats.read },
    { value: "ARCHIVED", label: "Archived", count: stats.archived },
  ];

  const typeLabels: Record<string, { label: string; color: string }> = {
    BUG_REPORT: { label: "Bug Report", color: "bg-red-500/20 text-red-400 border-red-800" },
    FEATURE_REQUEST: { label: "Feature Request", color: "bg-blue-500/20 text-blue-400 border-blue-800" },
    GENERAL: { label: "General", color: "bg-gray-500/20 text-gray-400 border-gray-700" },
  };

  const statusLabels: Record<string, { label: string; color: string }> = {
    PENDING: { label: "Pending", color: "bg-yellow-500/20 text-yellow-400 border-yellow-800" },
    READ: { label: "Read", color: "bg-blue-500/20 text-blue-400 border-blue-800" },
    ARCHIVED: { label: "Archived", color: "bg-gray-500/20 text-gray-400 border-gray-700" },
  };

  const handleRowClick = (feedbackId: string) => {
    navigate(`/feedback/${feedbackId}`);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-2">User Feedback</h2>
            <p className="text-theme-secondary text-sm">
              Feedback submitted by users from the console app
            </p>
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard title="Total Feedback" value={stats.total} />
          <StatCard title="Pending" value={stats.pending} variant="warning" />
          <StatCard title="Read" value={stats.read} />
          <StatCard title="Archived" value={stats.archived} variant="muted" />
        </div>

        {/* Filter and Table */}
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-theme flex items-center justify-between flex-wrap gap-4">
            <h3 className="text-xl font-semibold">Feedback</h3>
            <div className="flex gap-2 flex-wrap">
              {filters.map((f) => (
                <a
                  key={f.value}
                  href={`?status=${f.value}`}
                  className={`px-3 py-1.5 text-sm font-medium rounded transition cursor-pointer ${
                    status === f.value
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
                  <th>Type</th>
                  <th>Subject</th>
                  <th>User</th>
                  <th>Account</th>
                  <th>Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {feedback.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center text-theme-secondary !py-8">
                      No feedback found
                    </td>
                  </tr>
                ) : (
                  feedback.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => handleRowClick(item.id)}
                      className="cursor-pointer hover:bg-theme-tertiary transition-colors group"
                    >
                      <td>
                        <span className={`px-2 py-1 text-xs font-medium rounded border ${typeLabels[item.type]?.color || typeLabels.GENERAL.color}`}>
                          {typeLabels[item.type]?.label || item.type}
                        </span>
                      </td>
                      <td className="text-sm">
                        <div className="font-medium group-hover:text-(--color-brand-red) transition-colors flex items-center gap-2">
                          {item.subject}
                          {item._count.attachments > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs text-theme-muted" title={`${item._count.attachments} attachment${item._count.attachments !== 1 ? "s" : ""}`}>
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
                              </svg>
                              {item._count.attachments}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-theme-muted mt-0.5 line-clamp-1 max-w-xs">
                          {item.message}
                        </div>
                      </td>
                      <td className="text-sm text-theme-secondary">
                        <div>{item.user?.name || "Unknown"}</div>
                        <div className="text-xs text-theme-muted">{item.user?.email}</div>
                      </td>
                      <td className="text-sm text-theme-secondary">
                        {item.account?.name || "Unknown"}
                      </td>
                      <td className="text-sm text-theme-secondary whitespace-nowrap">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </td>
                      <td>
                        <span className={`px-2 py-1 text-xs font-medium rounded border ${statusLabels[item.status]?.color || statusLabels.PENDING.color}`}>
                          {statusLabels[item.status]?.label || item.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <Pagination pagination={pagination} status={status} />
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
  variant?: "default" | "warning" | "success" | "muted";
}) {
  const colors = {
    default: "bg-theme-card border-theme",
    warning: "bg-yellow-900/20 border-yellow-700",
    success: "bg-green-900/20 border-green-700",
    muted: "bg-theme-tertiary border-theme",
  };

  return (
    <div className={`rounded-xl p-6 border ${colors[variant]}`}>
      <h3 className="text-theme-secondary text-sm font-medium uppercase tracking-wider">{title}</h3>
      <p className="text-4xl font-bold mt-2">{value.toLocaleString()}</p>
    </div>
  );
}

function Pagination({ pagination, status }: { pagination: { page: number; pageSize: number; total: number; totalPages: number }; status: string }) {
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

  const buildUrl = (page: number) => `?status=${status}&page=${page}`;

  return (
    <div className="px-6 py-4 border-t border-theme flex items-center justify-between">
      <div className="text-sm text-theme-secondary">
        Showing {((currentPage - 1) * pagination.pageSize) + 1} to{" "}
        {Math.min(currentPage * pagination.pageSize, pagination.total)} of{" "}
        {pagination.total} results
      </div>

      <div className="flex gap-1">
        {currentPage > 1 ? (
          <a href={buildUrl(currentPage - 1)} className="px-3 py-1 text-sm bg-theme-tertiary text-theme-primary rounded hover:bg-theme-secondary transition cursor-pointer">
            Previous
          </a>
        ) : (
          <span className="px-3 py-1 text-sm bg-theme-card text-theme-muted rounded cursor-not-allowed">Previous</span>
        )}

        {pages.map((page, index) =>
          typeof page === "number" ? (
            <a
              key={index}
              href={buildUrl(page)}
              className={`px-3 py-1 text-sm rounded transition cursor-pointer ${
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
          <a href={buildUrl(currentPage + 1)} className="px-3 py-1 text-sm bg-theme-tertiary text-theme-primary rounded hover:bg-theme-secondary transition cursor-pointer">
            Next
          </a>
        ) : (
          <span className="px-3 py-1 text-sm bg-theme-card text-theme-muted rounded cursor-not-allowed">Next</span>
        )}
      </div>
    </div>
  );
}
