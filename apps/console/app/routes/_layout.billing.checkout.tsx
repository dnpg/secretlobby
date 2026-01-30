import { redirect } from "react-router";
import type { Route } from "./+types/_layout.billing.checkout";

export async function loader({ request }: Route.LoaderArgs) {
  // Server-only imports
  const { getSession, requireUserAuth } = await import("@secretlobby/auth");
  const { paymentManager, registerConfiguredGateways } = await import("@secretlobby/payments");
  const { getAccountStripeCustomerId } = await import("~/models/queries/account.server");

  registerConfiguredGateways();

  const { session } = await getSession(request);
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  if (!accountId) {
    throw redirect("/login");
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  // Handle "manage" action - redirect to Stripe customer portal
  if (action === "manage") {
    const account = await getAccountStripeCustomerId(accountId);

    if (!account?.stripeCustomerId) {
      throw redirect("/billing");
    }

    try {
      const baseUrl = `${url.protocol}//${url.host}`;
      const portalResult = await paymentManager.getCustomerPortalUrl(
        "stripe",
        account.stripeCustomerId,
        `${baseUrl}/billing`
      );

      throw redirect(portalResult.url);
    } catch (error) {
      console.error("Failed to create customer portal session:", error);
      throw redirect("/billing");
    }
  }

  // If no specific action, redirect to plans page
  throw redirect("/billing/plans");
}

export default function BillingCheckout() {
  // This shouldn't render as loader always redirects
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-4 border-theme-secondary border-t-blue-500 rounded-full mx-auto mb-4" />
        <p className="text-theme-secondary">Redirecting to checkout...</p>
      </div>
    </div>
  );
}
