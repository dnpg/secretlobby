import { Link, redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/_layout.billing";

export async function loader({ request }: Route.LoaderArgs) {
  // Server-only imports
  const { getSession, requireUserAuth } = await import("@secretlobby/auth");
  const { SUBSCRIPTION_TIERS } = await import("@secretlobby/payments");
  const { getAccountWithBillingInfo } = await import("~/models/queries/account.server");
  const { getActiveOrPastDueSubscription } = await import("~/models/queries/subscription.server");
  const { getRecentPayments } = await import("~/models/queries/payment.server");

  const { session } = await getSession(request);
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  if (!accountId) {
    throw redirect("/login");
  }

  const account = await getAccountWithBillingInfo(accountId);

  if (!account) {
    throw redirect("/login");
  }

  // Get active subscription
  const subscription = await getActiveOrPastDueSubscription(accountId);

  // Get recent payments
  const recentPayments = await getRecentPayments(accountId, 3);

  const currentTier = SUBSCRIPTION_TIERS[account.subscriptionTier] || SUBSCRIPTION_TIERS.FREE;

  return {
    account: {
      id: account.id,
      subscriptionTier: account.subscriptionTier,
      stripeCustomerId: account.stripeCustomerId,
    },
    currentTier,
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status,
          billingPeriod: subscription.billingPeriod,
          currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          gatewayId: subscription.gatewayId,
        }
      : null,
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
  const { account, currentTier, subscription, recentPayments } =
    useLoaderData<typeof loader>();

  const isFree = account.subscriptionTier === "FREE";

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
                {currentTier.name}
              </span>
              {subscription && subscription.billingPeriod && (
                <span className="px-2 py-0.5 text-xs bg-theme-tertiary rounded-full text-theme-secondary">
                  {subscription.billingPeriod === "yearly"
                    ? "Annual"
                    : "Monthly"}
                </span>
              )}
              {subscription?.status === "PAST_DUE" && (
                <span className="px-2 py-0.5 text-xs bg-red-500/20 text-red-400 rounded-full">
                  Past Due
                </span>
              )}
              {subscription?.cancelAtPeriodEnd && (
                <span className="px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded-full">
                  Cancelling
                </span>
              )}
            </div>
            <p className="text-theme-secondary text-sm mb-4">
              {currentTier.description}
            </p>
            <ul className="text-sm text-theme-secondary space-y-1">
              {currentTier.features.slice(0, 4).map((feature, i) => (
                <li key={i} className="flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-green-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>
          </div>
          <div className="text-right">
            {!isFree && subscription && (
              <div className="text-sm text-theme-secondary mb-2">
                {subscription.cancelAtPeriodEnd
                  ? "Access until"
                  : "Next billing date"}
              </div>
            )}
            {!isFree && subscription && (
              <div className="font-semibold">
                {formatDate(subscription.currentPeriodEnd)}
              </div>
            )}
            {!isFree && (
              <div className="text-2xl font-bold mt-2">
                {formatCurrency(
                  subscription?.billingPeriod === "yearly"
                    ? currentTier.priceYearly
                    : currentTier.priceMonthly
                )}
                <span className="text-sm font-normal text-theme-secondary">
                  /{subscription?.billingPeriod === "yearly" ? "year" : "month"}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-theme flex gap-3">
          <Link
            to="/billing/plans"
            className="px-4 py-2 btn-primary rounded-lg transition inline-block cursor-pointer"
          >
            {isFree ? "Upgrade Plan" : "Change Plan"}
          </Link>
          {!isFree && subscription && !subscription.cancelAtPeriodEnd && (
            <Link
              to="/billing/plans?action=cancel"
              className="px-4 py-2 btn-secondary rounded-lg transition inline-block cursor-pointer"
            >
              Cancel Subscription
            </Link>
          )}
        </div>
      </div>

      {/* Payment Methods - Only show if they have a Stripe customer */}
      {account.stripeCustomerId && (
        <div className="bg-theme-secondary border border-theme rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Payment Methods</h3>
            <Link
              to="methods"
              className="text-sm text-blue-400 hover:text-blue-300 transition"
            >
              View All
            </Link>
          </div>
          <p className="text-sm text-theme-secondary">
            Your saved payment methods for subscription billing.
          </p>
          <div className="mt-4 flex gap-3">
            <Link
              to="methods"
              className="text-sm text-theme-secondary hover:text-theme-primary transition"
            >
              View Payment Methods
            </Link>
            <span className="text-theme-secondary">|</span>
            <a
              href="/billing/checkout?action=manage"
              className="text-sm text-blue-400 hover:text-blue-300 transition"
            >
              Manage in Stripe Portal
            </a>
          </div>
        </div>
      )}

      {/* Recent Payments */}
      <div className="bg-theme-secondary border border-theme rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Recent Payments</h3>
          {recentPayments.length > 0 && (
            <Link
              to="history"
              className="text-sm text-blue-400 hover:text-blue-300 transition"
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

      {/* Billing Support */}
      <div className="bg-theme-secondary border border-theme rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-2">Need Help?</h3>
        <p className="text-sm text-theme-secondary mb-4">
          If you have questions about your billing or subscription, please
          contact our support team.
        </p>
        <a
          href="mailto:support@secretlobby.co"
          className="text-blue-400 hover:text-blue-300 transition text-sm"
        >
          support@secretlobby.co
        </a>
      </div>
    </div>
  );
}
