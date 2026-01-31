import { Link, redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/_layout.billing.methods";
import { PaymentMethodCard } from "@secretlobby/ui";
import { createLogger, formatError } from "@secretlobby/logger";

const logger = createLogger({ service: "console:billing:methods" });

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

  const account = await getAccountStripeCustomerId(accountId);

  if (!account) {
    throw redirect("/login");
  }

  // If no Stripe customer ID, they have no payment methods
  if (!account.stripeCustomerId) {
    return {
      paymentMethods: [],
      hasCustomer: false,
    };
  }

  // Fetch payment methods from Stripe
  let paymentMethods: {
    id: string;
    type: "card" | "paypal" | "bank_account" | "other";
    last4?: string;
    brand?: string;
    expiryMonth?: number;
    expiryYear?: number;
    isDefault: boolean;
  }[] = [];

  try {
    const gateway = paymentManager.getGateway("stripe");
    if (gateway) {
      const methods = await gateway.getPaymentMethods(account.stripeCustomerId);
      paymentMethods = methods.map((m) => ({
        id: m.id,
        type: m.type as "card" | "paypal" | "bank_account" | "other",
        last4: m.last4,
        brand: m.brand,
        expiryMonth: m.expiryMonth,
        expiryYear: m.expiryYear,
        isDefault: m.isDefault,
      }));
    }
  } catch (error) {
    logger.error(
      { error: formatError(error) },
      "Failed to fetch payment methods"
    );
  }

  return {
    paymentMethods,
    hasCustomer: true,
    stripeCustomerId: account.stripeCustomerId,
  };
}

export default function BillingMethods() {
  const { paymentMethods, hasCustomer } = useLoaderData<typeof loader>();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">Payment Methods</h2>
          <p className="text-theme-secondary">
            Manage your saved payment methods
          </p>
        </div>
        <Link
          to="/billing"
          className="text-sm text-theme-secondary hover:text-theme-primary transition"
        >
          Back to Billing
        </Link>
      </div>

      {!hasCustomer ? (
        <div className="bg-theme-secondary border border-theme rounded-lg p-12 text-center">
          <div className="text-theme-secondary mb-2">No payment methods</div>
          <p className="text-sm text-theme-secondary mb-4">
            You'll add a payment method when you subscribe to a plan.
          </p>
          <Link
            to="/billing/plans"
            className="px-4 py-2 btn-primary rounded-lg transition inline-block"
          >
            View Plans
          </Link>
        </div>
      ) : paymentMethods.length === 0 ? (
        <div className="bg-theme-secondary border border-theme rounded-lg p-12 text-center">
          <div className="text-theme-secondary mb-2">No payment methods saved</div>
          <p className="text-sm text-theme-secondary mb-4">
            Add a payment method through the Stripe portal.
          </p>
          <a
            href="/billing/checkout?action=manage"
            className="px-4 py-2 btn-primary rounded-lg transition inline-block"
          >
            Add Payment Method
          </a>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {paymentMethods.map((method) => (
              <PaymentMethodCard key={method.id} method={method} />
            ))}
          </div>

          <div className="bg-theme-secondary border border-theme rounded-lg p-6">
            <h3 className="font-semibold mb-2">Manage Payment Methods</h3>
            <p className="text-sm text-theme-secondary mb-4">
              To add, remove, or update payment methods, use the secure Stripe
              portal.
            </p>
            <a
              href="/billing/checkout?action=manage"
              className="px-4 py-2 btn-secondary rounded-lg transition inline-block"
            >
              Open Stripe Portal
            </a>
          </div>
        </>
      )}
    </div>
  );
}
