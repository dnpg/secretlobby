import { Link, redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/_layout.billing.history";

export async function loader({ request }: Route.LoaderArgs) {
  // Server-only imports
  const { getSession, requireUserAuth } = await import("@secretlobby/auth");
  const { getPaymentsWithPagination } = await import("~/models/queries/payment.server");

  const { session } = await getSession(request);
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  if (!accountId) {
    throw redirect("/login");
  }

  // Get all payments with pagination
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const pageSize = 20;

  const { payments, total } = await getPaymentsWithPagination(accountId, page, pageSize);

  return {
    payments: payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      description: p.description,
      gatewayId: p.gatewayId,
      invoiceUrl: p.invoiceUrl,
      receiptUrl: p.receiptUrl,
      createdAt: p.createdAt.toISOString(),
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

function formatCurrency(amount: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BillingHistory() {
  const { payments, pagination } = useLoaderData<typeof loader>();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">Payment History</h2>
          <p className="text-theme-secondary">
            View all your past payments and invoices
          </p>
        </div>
        <Link
          to="/billing"
          className="text-sm text-theme-secondary hover:text-theme-primary transition"
        >
          Back to Billing
        </Link>
      </div>

      {payments.length > 0 ? (
        <>
          {/* Payments Table */}
          <div className="bg-theme-secondary border border-theme rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-theme">
                  <th className="px-6 py-4 text-left text-sm font-semibold text-theme-secondary">
                    Date
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-theme-secondary">
                    Description
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-theme-secondary">
                    Status
                  </th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-theme-secondary">
                    Amount
                  </th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-theme-secondary">
                    Invoice
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme">
                {payments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-theme-tertiary/50">
                    <td className="px-6 py-4 text-sm">
                      {formatDate(payment.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {payment.description || "Subscription Payment"}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          payment.status === "SUCCEEDED"
                            ? "bg-green-500/20 text-green-400"
                            : payment.status === "FAILED"
                            ? "bg-red-500/20 text-red-400"
                            : payment.status === "REFUNDED"
                            ? "bg-blue-500/20 text-blue-400"
                            : "bg-yellow-500/20 text-yellow-400"
                        }`}
                      >
                        {payment.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-right font-medium">
                      {formatCurrency(payment.amount, payment.currency)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {payment.invoiceUrl || payment.receiptUrl ? (
                        <a
                          href={payment.invoiceUrl || payment.receiptUrl || "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 text-sm transition"
                        >
                          View
                        </a>
                      ) : (
                        <span className="text-theme-secondary text-sm">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-theme-secondary">
                Showing {(pagination.page - 1) * pagination.pageSize + 1} to{" "}
                {Math.min(
                  pagination.page * pagination.pageSize,
                  pagination.total
                )}{" "}
                of {pagination.total} payments
              </div>
              <div className="flex gap-2">
                {pagination.page > 1 && (
                  <Link
                    to={`?page=${pagination.page - 1}`}
                    className="px-4 py-2 btn-secondary rounded-lg transition text-sm"
                  >
                    Previous
                  </Link>
                )}
                {pagination.page < pagination.totalPages && (
                  <Link
                    to={`?page=${pagination.page + 1}`}
                    className="px-4 py-2 btn-secondary rounded-lg transition text-sm"
                  >
                    Next
                  </Link>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="bg-theme-secondary border border-theme rounded-lg p-12 text-center">
          <div className="text-theme-secondary mb-2">No payment history yet</div>
          <p className="text-sm text-theme-secondary">
            Your payment history will appear here after you make your first
            payment.
          </p>
        </div>
      )}
    </div>
  );
}
