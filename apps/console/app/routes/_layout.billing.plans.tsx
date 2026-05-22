/**
 * /billing/plans — pick a plan, start a Checkout session, manage cancellations.
 *
 * Security:
 *   - All POST handlers go through `csrfProtect` before touching Stripe.
 *   - The plan & billing cycle are validated server-side against the
 *     SubscriptionPlan catalog; clients cannot inject a Stripe price id.
 *   - The Stripe customer id is resolved server-side from the account row.
 */

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

interface PlanRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number;
  currency: string;
  features: string[];
  maxSongs: number;
  maxLobbies: number;
  maxStorage: number;
  customDomain: boolean;
  apiAccess: boolean;
  highlighted: boolean;
  hasStripePrice: boolean;
}

export async function loader({ request }: Route.LoaderArgs) {
  const { getSession, requireUserAuth, getCsrfToken } = await import(
    "@secretlobby/auth"
  );
  const { getCurrentSubscription, isBillingConfigured } = await import(
    "@secretlobby/payments/billing"
  );
  const { prisma } = await import("@secretlobby/db");

  const { session } = await getSession(request);
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  if (!accountId) throw redirect("/login");

  const current = await getCurrentSubscription(accountId);

  const plans = await prisma.subscriptionPlan.findMany({
    where: { isActive: true },
    orderBy: { position: "asc" },
  });

  const planRows: PlanRow[] = plans.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    priceMonthly: p.priceMonthly,
    priceYearly: p.priceYearly,
    currency: p.currency,
    features: Array.isArray(p.features) ? (p.features as string[]) : [],
    maxSongs: p.maxSongs,
    maxLobbies: p.maxLobbies,
    maxStorage: p.maxStorage,
    customDomain: p.customDomain,
    apiAccess: p.apiAccess,
    highlighted: p.highlighted,
    hasStripePrice: Boolean(p.stripePriceMonthly || p.stripePriceYearly),
  }));

  const csrfToken = await getCsrfToken(request);

  return {
    plans: planRows,
    current: {
      planSlug: current.plan.slug,
      planName: current.plan.name,
      billingPeriod: current.billingPeriod,
      cancelAtPeriodEnd: current.cancelAtPeriodEnd,
      currentPeriodEnd: current.currentPeriodEnd?.toISOString() ?? null,
      status: current.status,
      hasSubscription: current.id !== null,
    },
    billingConfigured: isBillingConfigured(),
    csrfToken,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { getSession, requireUserAuth } = await import("@secretlobby/auth");
  const { csrfProtect } = await import("@secretlobby/auth/csrf");
  const {
    createCheckoutSession,
    createCustomerPortalSession,
    BillingError,
    getStripeClient,
    getAppBaseUrl,
  } = await import("@secretlobby/payments/billing");
  const { createLogger, formatError } = await import(
    "@secretlobby/logger/server"
  );
  const { prisma } = await import("@secretlobby/db");

  const logger = createLogger({ service: "console:billing:plans" });

  // CSRF FIRST — this endpoint mutates billing state. Throws a Response
  // on failure which React Router will return verbatim.
  await csrfProtect(request);

  const { session } = await getSession(request);
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  if (!accountId) return { error: "Not authenticated" };

  const formData = await request.formData();
  const intent = formData.get("intent");

  // Build absolute redirect URLs from APP_BASE_URL — NOT from the
  // request's Host header. A misconfigured upstream proxy could
  // otherwise forward an attacker-controlled Host, causing Stripe's
  // success redirect to land on `evil.com/billing/success`.
  // getAppBaseUrl() fails closed (throws) when APP_BASE_URL is unset;
  // we refuse to start checkout in that case rather than silently
  // falling back to the request URL.
  let baseUrl: string;
  try {
    baseUrl = getAppBaseUrl();
  } catch (err) {
    logger.error(
      { err: formatError(err) },
      "APP_BASE_URL not configured — refusing to handle billing intent"
    );
    return { error: "Billing is not configured for this deployment." };
  }

  try {
    if (intent === "checkout") {
      const planSlug = String(formData.get("planSlug") ?? "");
      const billingCycle = String(formData.get("billingCycle") ?? "monthly");

      if (
        !planSlug ||
        (billingCycle !== "monthly" && billingCycle !== "yearly")
      ) {
        return { error: "Invalid plan selection" };
      }

      const result = await createCheckoutSession({
        accountId,
        planSlug,
        billingCycle,
        successUrl: `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${baseUrl}/billing/plans`,
      });

      logger.info(
        { accountId, planSlug, billingCycle, sessionId: result.sessionId },
        "Stripe checkout session created"
      );

      return redirect(result.url);
    }

    if (intent === "portal") {
      const result = await createCustomerPortalSession({
        accountId,
        returnUrl: `${baseUrl}/billing`,
      });
      return redirect(result.url);
    }

    if (intent === "cancel") {
      // Defer cancellation to the Customer Portal — Stripe will fire
      // the customer.subscription.updated/deleted webhook and our
      // handler will sync the DB. We just open the portal here.
      const result = await createCustomerPortalSession({
        accountId,
        returnUrl: `${baseUrl}/billing`,
      });
      return redirect(result.url);
    }

    if (intent === "reactivate") {
      // Reactivation = clear cancel_at_period_end. Talk to Stripe
      // directly; the webhook will sync our row.
      const account = await prisma.subscription.findFirst({
        where: {
          accountId,
          status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] },
          cancelAtPeriodEnd: true,
        },
        select: { gatewaySubscriptionId: true },
      });
      if (!account) {
        return { error: "No subscription to reactivate" };
      }
      const stripe = getStripeClient();
      await stripe.subscriptions.update(account.gatewaySubscriptionId, {
        cancel_at_period_end: false,
      });
      logger.info(
        { accountId, subscriptionId: account.gatewaySubscriptionId },
        "Subscription reactivated"
      );
      return { success: "Subscription reactivated" };
    }

    return { error: "Invalid action" };
  } catch (err) {
    if (err instanceof BillingError) {
      logger.warn(
        { code: err.code, accountId, intent },
        "Billing action rejected"
      );
      return { error: err.message };
    }
    // Don't surface raw error messages — they can leak internals.
    logger.error(
      { err: formatError(err), accountId, intent },
      "Billing action failed"
    );
    return { error: "Something went wrong. Please try again." };
  }
}

function formatCurrency(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export default function BillingPlans() {
  const { plans, current, billingConfigured, csrfToken } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">(
    "yearly"
  );
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  // searchParams currently unused; reserved for ?action=cancel deep-link UX.
  void searchParams;

  useEffect(() => {
    if (actionData?.success) toast.success(actionData.success);
    if (actionData?.error) toast.error(actionData.error);
  }, [actionData]);

  if (!billingConfigured) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Plans</h2>
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-6">
          <h3 className="text-yellow-400 font-semibold mb-2">
            Billing not configured
          </h3>
          <p className="text-sm text-theme-secondary">
            Stripe API credentials are missing. Contact your administrator.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">Choose Your Plan</h2>
          <p className="text-theme-secondary">
            Current plan:{" "}
            <span className="text-theme-primary font-medium">
              {current.planName}
            </span>
            {current.billingPeriod && ` (${current.billingPeriod})`}
          </p>
        </div>
        <Link
          to="/billing"
          className="text-sm text-theme-secondary hover:text-theme-primary transition cursor-pointer"
        >
          Back to Billing
        </Link>
      </div>

      {/* Billing cycle toggle */}
      <div className="flex items-center justify-center gap-4">
        <span
          className={`text-sm ${
            billingCycle === "monthly"
              ? "text-theme-primary font-medium"
              : "text-theme-secondary"
          }`}
        >
          Monthly
        </span>
        <button
          type="button"
          onClick={() =>
            setBillingCycle((c) => (c === "monthly" ? "yearly" : "monthly"))
          }
          className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer border-0 outline-none focus:outline-none ${
            billingCycle === "yearly" ? "bg-green-500" : "bg-gray-600"
          }`}
          aria-label="Toggle billing cycle"
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
              billingCycle === "yearly" ? "translate-x-6" : "translate-x-0"
            }`}
          />
        </button>
        <span
          className={`text-sm ${
            billingCycle === "yearly"
              ? "text-theme-primary font-medium"
              : "text-theme-secondary"
          }`}
        >
          Yearly
          <span className="ml-1 text-green-400 text-xs">(Save ~17%)</span>
        </span>
      </div>

      {/* Plans grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {plans.map((plan) => {
          const isCurrent = plan.slug === current.planSlug;
          const price =
            billingCycle === "yearly" ? plan.priceYearly : plan.priceMonthly;
          const isFreePlan = plan.priceMonthly === 0 && plan.priceYearly === 0;

          return (
            <div
              key={plan.id}
              className={`bg-theme-secondary border rounded-lg p-6 flex flex-col ${
                plan.highlighted
                  ? "border-blue-500 ring-2 ring-blue-500/20"
                  : "border-theme"
              } ${
                isCurrent ? "ring-2 ring-green-500/20 border-green-500" : ""
              }`}
            >
              {plan.highlighted && !isCurrent && (
                <div className="text-xs font-semibold text-blue-400 mb-2">
                  MOST POPULAR
                </div>
              )}
              {isCurrent && (
                <div className="text-xs font-semibold text-green-400 mb-2">
                  CURRENT PLAN
                </div>
              )}

              <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
              <p className="text-sm text-theme-secondary mb-4">
                {plan.description}
              </p>

              <div className="mb-6">
                <span className="text-3xl font-bold">
                  {isFreePlan ? "Free" : formatCurrency(price, plan.currency)}
                </span>
                {!isFreePlan && (
                  <span className="text-theme-secondary">
                    /{billingCycle === "yearly" ? "year" : "month"}
                  </span>
                )}
              </div>

              <ul className="space-y-2 mb-6 flex-1 text-sm text-theme-secondary">
                <li>
                  {plan.maxLobbies === -1 ? "Unlimited" : plan.maxLobbies} lobbies
                </li>
                <li>
                  {plan.maxSongs === -1 ? "Unlimited" : plan.maxSongs} songs
                </li>
                {plan.features.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>

              {isCurrent ? (
                <div className="px-4 py-2 bg-green-500/20 text-green-400 text-center rounded-lg">
                  Current Plan
                </div>
              ) : isFreePlan ? (
                <div className="px-4 py-2 bg-theme-tertiary text-theme-secondary text-center rounded-lg text-sm">
                  Downgrade via cancel
                </div>
              ) : !plan.hasStripePrice ? (
                <div className="px-4 py-2 bg-yellow-500/10 text-yellow-400 text-center rounded-lg text-xs">
                  Plan not configured
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setSelectedPlan(plan.slug)}
                  className="w-full px-4 py-2 btn-primary rounded-lg transition cursor-pointer"
                >
                  Switch to {plan.name}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Manage subscription via Portal */}
      {current.hasSubscription && (
        <div className="bg-theme-secondary border border-theme rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-2">Manage Subscription</h3>
          <p className="text-sm text-theme-secondary mb-4">
            Use the Stripe Customer Portal to update payment methods, view
            invoices, or cancel your subscription.
          </p>
          <Form method="post">
            <input type="hidden" name="_csrf" value={csrfToken} />
            <input type="hidden" name="intent" value="portal" />
            <button
              type="submit"
              className="px-4 py-2 btn-secondary rounded-lg transition cursor-pointer"
            >
              Open Customer Portal
            </button>
          </Form>
        </div>
      )}

      {/* Reactivate */}
      {current.cancelAtPeriodEnd && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-2 text-yellow-400">
            Subscription Scheduled for Cancellation
          </h3>
          <p className="text-sm text-theme-secondary mb-4">
            Reactivate to continue beyond{" "}
            {current.currentPeriodEnd &&
              new Date(current.currentPeriodEnd).toLocaleDateString()}
            .
          </p>
          <Form method="post">
            <input type="hidden" name="_csrf" value={csrfToken} />
            <input type="hidden" name="intent" value="reactivate" />
            <button
              type="submit"
              className="px-4 py-2 btn-primary rounded-lg transition cursor-pointer"
            >
              Reactivate Subscription
            </button>
          </Form>
        </div>
      )}

      {/* Checkout confirmation modal */}
      {selectedPlan && (() => {
        const plan = plans.find((p) => p.slug === selectedPlan);
        if (!plan) return null;
        const price =
          billingCycle === "yearly" ? plan.priceYearly : plan.priceMonthly;
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-theme-primary border border-theme rounded-xl p-6 w-full max-w-md">
              <h3 className="text-xl font-bold mb-4">Switch to {plan.name}</h3>
              <div className="bg-theme-secondary rounded-lg p-4 mb-6">
                <div className="flex justify-between items-baseline">
                  <div className="font-medium">{plan.name}</div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">
                      {formatCurrency(price, plan.currency)}
                    </div>
                    <div className="text-sm text-theme-secondary">
                      per {billingCycle === "yearly" ? "year" : "month"}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedPlan(null)}
                  className="flex-1 px-4 py-2 btn-secondary rounded-lg transition cursor-pointer"
                >
                  Cancel
                </button>
                <Form method="post" className="flex-1">
                  <input type="hidden" name="_csrf" value={csrfToken} />
                  <input type="hidden" name="intent" value="checkout" />
                  <input type="hidden" name="planSlug" value={plan.slug} />
                  <input
                    type="hidden"
                    name="billingCycle"
                    value={billingCycle}
                  />
                  <button
                    type="submit"
                    className="w-full px-4 py-2 btn-primary rounded-lg transition cursor-pointer"
                  >
                    Continue to Checkout
                  </button>
                </Form>
              </div>
              <p className="text-xs text-theme-secondary text-center mt-4">
                You'll be redirected to Stripe to complete payment securely.
              </p>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
