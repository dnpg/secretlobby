import { useEffect, useState } from "react";
import { Link, redirect, useLoaderData, useRevalidator } from "react-router";
import type { Route } from "./+types/_layout.billing.success";
import { toast } from "sonner";

export async function loader({ request }: Route.LoaderArgs) {
  // Server-only imports
  const { getSession, requireUserAuth } = await import("@secretlobby/auth");
  const { SUBSCRIPTION_TIERS, getStripeClient, registerConfiguredGateways } = await import("@secretlobby/payments");
  const { getAccountById } = await import("~/models/queries/account.server");
  const { getActiveSubscription } = await import("~/models/queries/subscription.server");

  registerConfiguredGateways();

  const { session } = await getSession(request);
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  if (!accountId) {
    throw redirect("/login");
  }

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");

  if (!sessionId) {
    throw redirect("/billing");
  }

  // Verify the checkout session with Stripe
  let checkoutTierId: string | null = null;
  let checkoutCompleted = false;

  try {
    const stripe = getStripeClient();
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);

    if (checkoutSession.payment_status === "paid") {
      checkoutCompleted = true;
      checkoutTierId = checkoutSession.metadata?.tierId || null;
    }
  } catch (error) {
    console.error("Failed to verify checkout session:", error);
    // Continue anyway - we'll check the database
  }

  // Get the latest account data
  const account = await getAccountById(accountId);

  if (!account) {
    throw redirect("/login");
  }

  // Check if subscription has been updated in the database
  const subscription = await getActiveSubscription(accountId);

  // Determine if we're still waiting for webhook to process
  const isProcessing =
    checkoutCompleted &&
    checkoutTierId &&
    account.subscriptionTier !== checkoutTierId &&
    account.subscriptionTier === "FREE";

  const tier = SUBSCRIPTION_TIERS[account.subscriptionTier] || SUBSCRIPTION_TIERS.FREE;
  const expectedTier = checkoutTierId
    ? SUBSCRIPTION_TIERS[checkoutTierId as keyof typeof SUBSCRIPTION_TIERS]
    : null;

  return {
    tier: {
      id: account.subscriptionTier,
      name: tier.name,
      description: tier.description,
    },
    expectedTier: expectedTier
      ? {
          id: checkoutTierId,
          name: expectedTier.name,
          description: expectedTier.description,
        }
      : null,
    isProcessing,
    hasSubscription: !!subscription,
    sessionId,
  };
}

export default function BillingSuccess() {
  const { tier, expectedTier, isProcessing } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const [hasShownToast, setHasShownToast] = useState(false);

  // Auto-revalidate while processing
  useEffect(() => {
    if (isProcessing) {
      const interval = setInterval(() => {
        revalidator.revalidate();
      }, 2000); // Check every 2 seconds

      return () => clearInterval(interval);
    }
  }, [isProcessing, revalidator]);

  // Show success toast only once when processing completes
  useEffect(() => {
    if (!isProcessing && !hasShownToast) {
      toast.success("Welcome to your new plan!");
      setHasShownToast(true);
    }
  }, [isProcessing, hasShownToast]);

  // Show the expected tier name if still processing, otherwise show actual tier
  const displayTier = isProcessing && expectedTier ? expectedTier : tier;

  if (isProcessing) {
    return (
      <div className="max-w-lg mx-auto text-center py-12">
        {/* Processing Icon */}
        <div className="w-20 h-20 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-10 h-10 text-blue-400 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>

        <h2 className="text-3xl font-bold mb-4">Processing Your Subscription</h2>
        <p className="text-theme-secondary mb-8">
          Please wait while we activate your {displayTier.name} plan. This usually
          takes just a few seconds.
        </p>

        <div className="bg-theme-secondary border border-theme rounded-lg p-6">
          <div className="flex items-center justify-center gap-2 text-theme-secondary">
            <svg
              className="w-5 h-5 animate-pulse"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>Confirming payment with Stripe...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto text-center py-12">
      {/* Success Icon */}
      <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
        <svg
          className="w-10 h-10 text-green-400"
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
      </div>

      <h2 className="text-3xl font-bold mb-4">Welcome to {displayTier.name}!</h2>
      <p className="text-theme-secondary mb-8">
        Your subscription has been activated. You now have access to all the
        features included in your new plan.
      </p>

      <div className="bg-theme-secondary border border-theme rounded-lg p-6 mb-8">
        <h3 className="font-semibold mb-2">What's Next?</h3>
        <ul className="text-sm text-theme-secondary text-left space-y-2">
          <li className="flex items-start gap-2">
            <svg
              className="w-5 h-5 text-green-400 shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Your account has been upgraded to {displayTier.name}
          </li>
          <li className="flex items-start gap-2">
            <svg
              className="w-5 h-5 text-green-400 shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            A receipt has been sent to your email
          </li>
          <li className="flex items-start gap-2">
            <svg
              className="w-5 h-5 text-green-400 shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            You can manage your subscription anytime from the billing page
          </li>
        </ul>
      </div>

      <div className="flex gap-4 justify-center">
        <Link
          to="/billing"
          className="px-6 py-3 btn-secondary rounded-lg transition"
        >
          View Billing
        </Link>
        <Link to="/" className="px-6 py-3 btn-primary rounded-lg transition">
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
