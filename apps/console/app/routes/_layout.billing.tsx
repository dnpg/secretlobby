/**
 * /billing — overview: current plan, next billing date, recent payments.
 *
 * Read-only. Action mutations live in `/billing/plans` (or are deferred
 * to the Stripe Customer Portal).
 */

import { Link, redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/_layout.billing";

export async function loader({ request }: Route.LoaderArgs) {
  const { getSession, requireUserAuth } = await import("@secretlobby/auth");
  const { getCurrentSubscription } = await import(
    "@secretlobby/payments/billing"
  );
  const { getRecentPayments } = await import("~/models/queries/payment.server");

  const { session } = await getSession(request);
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  if (!accountId) throw redirect("/login");

  const current = await getCurrentSubscription(accountId);
  const recentPayments = await getRecentPayments(accountId, 5);

  return {
    plan: current.plan,
    subscription: {
      status: current.status,
      billingPeriod: current.billingPeriod,
      currentPeriodEnd: current.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: current.cancelAtPeriodEnd,
      hasSubscription: current.id !== null,
    },
    recentPayments: recentPayments.map((p) => ({
      id: p.id,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      description: p.description,
      createdAt: p.createdAt.toISOString(),
    })),
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
  });
}

export default function Billing() {
  const { plan, subscription, recentPayments } = useLoaderData<typeof loader>();
  const isFree = plan.slug === "FREE";

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-2">Billing & Subscription</h2>
        <p className="text-theme-secondary">
          Manage your subscription and payment methods
        </p>
      </div>

      {/* Current Plan */}
      <div className="bg-theme-secondary border border-theme rounded-lg p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold mb-2">Current Plan</h3>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl font-bold text-theme-primary">
                {plan.name}
              </span>
              {subscription.billingPeriod && (
                <span className="px-2 py-0.5 text-xs bg-theme-tertiary rounded-full text-theme-secondary">
                  {subscription.billingPeriod === "yearly" ? "Annual" : "Monthly"}
                </span>
              )}
              {subscription.status === "PAST_DUE" && (
                <span className="px-2 py-0.5 text-xs bg-red-500/20 text-red-400 rounded-full">
                  Past Due
                </span>
              )}
              {subscription.cancelAtPeriodEnd && (
                <span className="px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded-full">
                  Cancelling
                </span>
              )}
            </div>
            <ul className="text-sm text-theme-secondary space-y-1">
              <li>
                {plan.maxLobbies === -1 ? "Unlimited" : plan.maxLobbies} lobbies
              </li>
              <li>
                {plan.maxSongs === -1 ? "Unlimited" : plan.maxSongs} songs
              </li>
              {plan.features.slice(0, 4).map((feature, i) => (
                <li key={i}>{feature}</li>
              ))}
            </ul>
          </div>
          <div className="text-right">
            {!isFree && subscription.currentPeriodEnd && (
              <>
                <div className="text-sm text-theme-secondary mb-2">
                  {subscription.cancelAtPeriodEnd ? "Access until" : "Next billing date"}
                </div>
                <div className="font-semibold">
                  {formatDate(subscription.currentPeriodEnd)}
                </div>
              </>
            )}
            {!isFree && (
              <div className="text-2xl font-bold mt-2">
                {formatCurrency(
                  subscription.billingPeriod === "yearly"
                    ? plan.priceYearly
                    : plan.priceMonthly,
                  plan.currency
                )}
                <span className="text-sm font-normal text-theme-secondary">
                  /{subscription.billingPeriod === "yearly" ? "year" : "month"}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-theme flex gap-3">
          <Link
            to="/billing/plans"
            className="px-4 py-2 btn-primary rounded-lg transition cursor-pointer"
          >
            {isFree ? "Upgrade Plan" : "Change Plan"}
          </Link>
          {subscription.hasSubscription && (
            <Link
              to="/billing/history"
              className="px-4 py-2 btn-secondary rounded-lg transition cursor-pointer"
            >
              Payment History
            </Link>
          )}
        </div>
      </div>

      {/* Recent Payments */}
      <div className="bg-theme-secondary border border-theme rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Recent Payments</h3>
          {recentPayments.length > 0 && (
            <Link
              to="/billing/history"
              className="text-sm text-blue-400 hover:text-blue-300 transition cursor-pointer"
            >
              View All
            </Link>
          )}
        </div>

        {recentPayments.length > 0 ? (
          <div className="space-y-3">
            {recentPayments.map((payment) => (
              <div
                key={payment.id}
                className="flex items-center justify-between p-3 bg-theme-tertiary rounded-lg"
              >
                <div>
                  <div className="font-medium">
                    {payment.description || "Subscription Payment"}
                  </div>
                  <div className="text-sm text-theme-secondary">
                    {formatDate(payment.createdAt)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`px-2 py-0.5 text-xs rounded-full ${
                      payment.status === "SUCCEEDED"
                        ? "bg-green-500/20 text-green-400"
                        : payment.status === "FAILED"
                        ? "bg-red-500/20 text-red-400"
                        : "bg-yellow-500/20 text-yellow-400"
                    }`}
                  >
                    {payment.status}
                  </span>
                  <span className="font-semibold">
                    {formatCurrency(payment.amount, payment.currency)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-theme-secondary">
            No payment history yet
          </div>
        )}
      </div>

      {/* Support */}
      <div className="bg-theme-secondary border border-theme rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-2">Need Help?</h3>
        <p className="text-sm text-theme-secondary mb-4">
          If you have questions about your billing, please contact support.
        </p>
        <a
          href="mailto:support@secretlobby.co"
          className="text-blue-400 hover:text-blue-300 transition text-sm cursor-pointer"
        >
          support@secretlobby.co
        </a>
      </div>
    </div>
  );
}
