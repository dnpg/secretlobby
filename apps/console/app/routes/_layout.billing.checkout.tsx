/**
 * /billing/checkout — legacy redirect target.
 *
 * Currently only supports `?action=manage` to deep-link into the Stripe
 * Customer Portal. Direct checkout creation now lives on the plans
 * page (`/billing/plans` action handler), which goes through CSRF
 * protection. We keep this route for any links that haven't migrated
 * yet — it just bounces to the Customer Portal or back to plans.
 */

import { redirect } from "react-router";
import type { Route } from "./+types/_layout.billing.checkout";

export async function loader({ request }: Route.LoaderArgs) {
  const { getSession, requireUserAuth } = await import("@secretlobby/auth");
  const { createCustomerPortalSession, BillingError } = await import(
    "@secretlobby/payments/billing"
  );
  const { createLogger, formatError } = await import(
    "@secretlobby/logger/server"
  );

  const logger = createLogger({ service: "console:billing:checkout" });

  const { session } = await getSession(request);
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  if (!accountId) throw redirect("/login");

  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  if (action === "manage") {
    try {
      const baseUrl = `${url.protocol}//${url.host}`;
      const portal = await createCustomerPortalSession({
        accountId,
        returnUrl: `${baseUrl}/billing`,
      });
      throw redirect(portal.url);
    } catch (err) {
      // Re-throw redirects (React Router uses thrown Responses for nav)
      if (err instanceof Response) throw err;
      if (err instanceof BillingError) {
        logger.warn({ code: err.code, accountId }, "Customer portal unavailable");
        throw redirect("/billing/plans");
      }
      logger.error({ err: formatError(err), accountId }, "Customer portal failed");
      throw redirect("/billing");
    }
  }

  throw redirect("/billing/plans");
}

export default function BillingCheckout() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-4 border-theme-secondary border-t-blue-500 rounded-full mx-auto mb-4" />
        <p className="text-theme-secondary">Redirecting...</p>
      </div>
    </div>
  );
}
