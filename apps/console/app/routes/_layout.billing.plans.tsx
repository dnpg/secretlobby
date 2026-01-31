import { useEffect, useState } from "react";
import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  useSearchParams,
} from "react-router";
import type { Route } from "./+types/_layout.billing.plans";
import { toast } from "sonner";
import { createLogger, formatError } from "@secretlobby/logger";

const logger = createLogger({ service: "console:billing:plans" });

// Types only - these are safe for client
import type { SubscriptionTier } from "@secretlobby/payments";

export async function loader({ request }: Route.LoaderArgs) {
  // Server-only imports
  const { getSession, requireUserAuth } = await import("@secretlobby/auth");
  const { SUBSCRIPTION_TIERS, paymentManager, registerConfiguredGateways } = await import("@secretlobby/payments");
  const { getAccountWithBillingInfo } = await import("~/models/queries/account.server");
  const { getActiveOrPastDueSubscription } = await import("~/models/queries/subscription.server");

  // Register gateways
  registerConfiguredGateways();

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

  // Get available payment gateways
  const availableGateways = paymentManager.getAvailableGateways();

  // Get active subscription for cancel flow
  const subscription = await getActiveOrPastDueSubscription(accountId);

  return {
    account: {
      id: account.id,
      subscriptionTier: account.subscriptionTier,
      stripeCustomerId: account.stripeCustomerId,
    },
    subscription: subscription
      ? {
          id: subscription.id,
          gatewayId: subscription.gatewayId,
          gatewaySubscriptionId: subscription.gatewaySubscriptionId,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        }
      : null,
    tiers: Object.values(SUBSCRIPTION_TIERS) as SubscriptionTier[],
    availableGateways,
  };
}

export async function action({ request }: Route.ActionArgs) {
  // Server-only imports
  const { getSession, requireUserAuth } = await import("@secretlobby/auth");
  const { paymentManager, registerConfiguredGateways } = await import("@secretlobby/payments");
  const { getAccountWithOwner } = await import("~/models/queries/account.server");
  const { getActiveOrPastDueSubscription, getCancellableSubscription } = await import("~/models/queries/subscription.server");
  const { updateSubscription } = await import("~/models/mutations/subscription.server");

  // Register gateways
  registerConfiguredGateways();

  const { session } = await getSession(request);
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  if (!accountId) {
    return { error: "Not authenticated" };
  }

  const account = await getAccountWithOwner(accountId);

  if (!account) {
    return { error: "Account not found" };
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    if (intent === "checkout") {
      const tierId = formData.get("tierId") as string;
      const billingPeriod = formData.get("billingPeriod") as
        | "monthly"
        | "yearly";
      const gatewayId = (formData.get("gatewayId") as string) || undefined;

      if (!tierId || !billingPeriod) {
        return { error: "Missing required fields" };
      }

      if (tierId === "FREE") {
        return { error: "Cannot checkout for free tier" };
      }

      // Get console URL for redirects
      const url = new URL(request.url);
      const baseUrl = `${url.protocol}//${url.host}`;

      // Get customer email
      const ownerEmail =
        account.users[0]?.user?.email || session.userEmail || "";

      const result = await paymentManager.createCheckoutSession(
        {
          accountId,
          tierId,
          billingPeriod,
          successUrl: `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${baseUrl}/billing/plans`,
          customerId: account.stripeCustomerId || undefined,
          customerEmail: ownerEmail,
          metadata: {
            accountId,
          },
        },
        gatewayId
      );

      // Redirect to checkout
      return redirect(result.checkoutUrl);
    }

    if (intent === "cancel") {
      const subscription = await getActiveOrPastDueSubscription(accountId);

      if (!subscription) {
        return { error: "No active subscription found" };
      }

      // Cancel at period end (not immediately)
      await paymentManager.cancelSubscription(
        subscription.gatewayId,
        subscription.gatewaySubscriptionId,
        false
      );

      // Update local record
      await updateSubscription(subscription.id, { cancelAtPeriodEnd: true });

      return { success: "Subscription will be cancelled at the end of the billing period" };
    }

    if (intent === "reactivate") {
      const subscription = await getCancellableSubscription(accountId);

      if (!subscription) {
        return { error: "No subscription to reactivate" };
      }

      // Reactivate by updating cancel_at_period_end to false
      await paymentManager.updateSubscription(
        subscription.gatewayId,
        subscription.gatewaySubscriptionId,
        { cancelAtPeriodEnd: false }
      );

      // Update local record
      await updateSubscription(subscription.id, { cancelAtPeriodEnd: false });

      return { success: "Subscription reactivated successfully" };
    }

    return { error: "Invalid action" };
  } catch (error) {
    logger.error({ error: formatError(error) }, "Billing action error");
    return {
      error:
        error instanceof Error ? error.message : "An error occurred. Please try again.",
    };
  }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount / 100);
}

export default function BillingPlans() {
  const { account, subscription, tiers, availableGateways } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">(
    "yearly"
  );
  const [showCancelConfirm, setShowCancelConfirm] = useState(
    searchParams.get("action") === "cancel"
  );
  const [selectedTier, setSelectedTier] = useState<string | null>(null);

  useEffect(() => {
    if (actionData?.success) {
      toast.success(actionData.success);
      setShowCancelConfirm(false);
    }
    if (actionData?.error) {
      toast.error(actionData.error);
    }
  }, [actionData]);

  const currentTierIndex = tiers.findIndex(
    (t) => t.id === account.subscriptionTier
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">Choose Your Plan</h2>
          <p className="text-theme-secondary">
            Select the plan that best fits your needs
          </p>
        </div>
        <Link
          to="/billing"
          className="text-sm text-theme-secondary hover:text-theme-primary transition"
        >
          Back to Billing
        </Link>
      </div>

      {/* Billing Period Toggle */}
      <div className="flex items-center justify-center gap-4">
        <span
          className={`text-sm ${
            billingPeriod === "monthly"
              ? "text-theme-primary font-medium"
              : "text-theme-secondary"
          }`}
        >
          Monthly
        </span>
        <button
          type="button"
          onClick={() =>
            setBillingPeriod((p) => (p === "monthly" ? "yearly" : "monthly"))
          }
          className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer border-0 outline-none focus:outline-none ${
            billingPeriod === "yearly" ? "bg-green-500" : "bg-gray-600"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
              billingPeriod === "yearly" ? "translate-x-6" : "translate-x-0"
            }`}
          />
        </button>
        <span
          className={`text-sm ${
            billingPeriod === "yearly"
              ? "text-theme-primary font-medium"
              : "text-theme-secondary"
          }`}
        >
          Yearly
          <span className="ml-1 text-green-400 text-xs">(Save 17%)</span>
        </span>
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {tiers.map((tier, index) => {
          const isCurrent = tier.id === account.subscriptionTier;
          const isUpgrade = index > currentTierIndex;
          const isDowngrade = index < currentTierIndex && index > 0;
          const price =
            billingPeriod === "yearly" ? tier.priceYearly : tier.priceMonthly;

          return (
            <div
              key={tier.id}
              className={`bg-theme-secondary border rounded-lg p-6 flex flex-col ${
                tier.highlighted
                  ? "border-blue-500 ring-2 ring-blue-500/20"
                  : "border-theme"
              } ${isCurrent ? "ring-2 ring-green-500/20 border-green-500" : ""}`}
            >
              {tier.highlighted && !isCurrent && (
                <div className="text-xs font-semibold text-blue-400 mb-2">
                  MOST POPULAR
                </div>
              )}
              {isCurrent && (
                <div className="text-xs font-semibold text-green-400 mb-2">
                  CURRENT PLAN
                </div>
              )}

              <h3 className="text-xl font-bold mb-1">{tier.name}</h3>
              <p className="text-sm text-theme-secondary mb-4">
                {tier.description}
              </p>

              <div className="mb-6">
                <span className="text-3xl font-bold">
                  {tier.priceMonthly === 0 ? "Free" : formatCurrency(price)}
                </span>
                {tier.priceMonthly > 0 && (
                  <span className="text-theme-secondary">
                    /{billingPeriod === "yearly" ? "year" : "month"}
                  </span>
                )}
              </div>

              <ul className="space-y-2 mb-6 flex-1">
                {tier.features.map((feature, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-theme-secondary"
                  >
                    <svg
                      className="w-4 h-4 text-green-400 mt-0.5 shrink-0"
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

              {tier.id === "FREE" ? (
                isCurrent ? (
                  <div className="px-4 py-2 bg-theme-tertiary text-theme-secondary text-center rounded-lg">
                    Current Plan
                  </div>
                ) : (
                  <div className="px-4 py-2 bg-theme-tertiary text-theme-secondary text-center rounded-lg text-sm">
                    Downgrade via cancel
                  </div>
                )
              ) : isCurrent ? (
                <div className="px-4 py-2 bg-green-500/20 text-green-400 text-center rounded-lg">
                  Current Plan
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setSelectedTier(tier.id)}
                  className={`w-full px-4 py-2 rounded-lg transition ${
                    isUpgrade
                      ? "btn-primary"
                      : "btn-secondary"
                  }`}
                >
                  {isUpgrade ? "Upgrade" : isDowngrade ? "Downgrade" : "Select"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Cancel Subscription Section */}
      {subscription && !subscription.cancelAtPeriodEnd && (
        <div className="bg-theme-secondary border border-theme rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-2">Cancel Subscription</h3>
          <p className="text-sm text-theme-secondary mb-4">
            If you cancel, you'll continue to have access until the end of your
            current billing period.
          </p>

          {showCancelConfirm ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
              <p className="text-sm text-red-400 mb-4">
                Are you sure you want to cancel? You'll lose access to premium
                features at the end of your billing period.
              </p>
              <div className="flex gap-3">
                <Form method="post">
                  <input type="hidden" name="intent" value="cancel" />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition"
                  >
                    Yes, Cancel
                  </button>
                </Form>
                <button
                  type="button"
                  onClick={() => setShowCancelConfirm(false)}
                  className="px-4 py-2 btn-secondary rounded-lg transition"
                >
                  Keep Subscription
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowCancelConfirm(true)}
              className="text-red-400 hover:text-red-300 text-sm transition"
            >
              Cancel Subscription
            </button>
          )}
        </div>
      )}

      {/* Reactivate Section */}
      {subscription?.cancelAtPeriodEnd && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-2 text-yellow-400">
            Subscription Scheduled for Cancellation
          </h3>
          <p className="text-sm text-theme-secondary mb-4">
            Your subscription is set to cancel at the end of the current billing
            period. You can reactivate it to continue your plan.
          </p>
          <Form method="post">
            <input type="hidden" name="intent" value="reactivate" />
            <button
              type="submit"
              className="px-4 py-2 btn-primary rounded-lg transition"
            >
              Reactivate Subscription
            </button>
          </Form>
        </div>
      )}

      {/* Gateway Info */}
      {availableGateways.length === 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
          <p className="text-sm text-yellow-400">
            Payment processing is not configured. Please contact support.
          </p>
        </div>
      )}

      {/* Plan Selection Confirmation Modal */}
      {selectedTier && (() => {
        const tier = tiers.find(t => t.id === selectedTier);
        if (!tier) return null;

        const price = billingPeriod === "yearly" ? tier.priceYearly : tier.priceMonthly;
        const currentTier = tiers.find(t => t.id === account.subscriptionTier);
        const isUpgrade = tiers.findIndex(t => t.id === selectedTier) > currentTierIndex;

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-theme-primary border border-theme rounded-xl p-6 w-full max-w-md">
              <h3 className="text-xl font-bold mb-4">
                {isUpgrade ? "Upgrade to" : "Switch to"} {tier.name}
              </h3>

              {/* Plan Summary */}
              <div className="bg-theme-secondary rounded-lg p-4 mb-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="font-semibold text-lg">{tier.name}</div>
                    <div className="text-sm text-theme-secondary">{tier.description}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">{formatCurrency(price)}</div>
                    <div className="text-sm text-theme-secondary">
                      per {billingPeriod === "yearly" ? "year" : "month"}
                    </div>
                  </div>
                </div>

                {currentTier && currentTier.id !== "FREE" && (
                  <div className="pt-4 border-t border-theme">
                    <div className="text-sm text-theme-secondary">
                      Changing from <span className="text-theme-primary font-medium">{currentTier.name}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Features Preview */}
              <div className="mb-6">
                <div className="text-sm font-medium mb-2">Included features:</div>
                <ul className="space-y-1">
                  {tier.features.slice(0, 4).map((feature, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-theme-secondary">
                      <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                  {tier.features.length > 4 && (
                    <li className="text-sm text-theme-secondary pl-6">
                      +{tier.features.length - 4} more features
                    </li>
                  )}
                </ul>
              </div>

              {/* Billing Period Toggle in Modal */}
              <div className="flex items-center justify-center gap-3 mb-6 p-3 bg-theme-tertiary rounded-lg">
                <button
                  type="button"
                  onClick={() => setBillingPeriod("monthly")}
                  className={`px-3 py-1 rounded text-sm transition ${
                    billingPeriod === "monthly"
                      ? "bg-theme-primary text-theme-primary"
                      : "text-theme-secondary hover:text-theme-primary"
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setBillingPeriod("yearly")}
                  className={`px-3 py-1 rounded text-sm transition ${
                    billingPeriod === "yearly"
                      ? "bg-theme-primary text-theme-primary"
                      : "text-theme-secondary hover:text-theme-primary"
                  }`}
                >
                  Yearly <span className="text-green-400 text-xs">(Save 17%)</span>
                </button>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedTier(null)}
                  className="flex-1 px-4 py-2 btn-secondary rounded-lg transition"
                >
                  Cancel
                </button>
                <Form method="post" className="flex-1">
                  <input type="hidden" name="intent" value="checkout" />
                  <input type="hidden" name="tierId" value={selectedTier} />
                  <input type="hidden" name="billingPeriod" value={billingPeriod} />
                  {availableGateways.length > 0 && (
                    <input type="hidden" name="gatewayId" value={availableGateways[0].id} />
                  )}
                  <button
                    type="submit"
                    className="w-full px-4 py-2 btn-primary rounded-lg transition"
                  >
                    Continue to Checkout
                  </button>
                </Form>
              </div>

              <p className="text-xs text-theme-secondary text-center mt-4">
                You'll be redirected to Stripe to complete your payment securely.
              </p>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
