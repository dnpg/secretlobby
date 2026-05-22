/**
 * Stripe Checkout & Customer Portal helpers.
 *
 * Security boundary: nothing in here trusts data from the client. The
 * caller passes accountId + planSlug; we resolve everything else
 * (customer id, price id, owner email) from the database. Even if the
 * client somehow injects a different price_id or customer_id into the
 * form, we ignore it.
 *
 * Idempotency: checkout-session creation uses an idempotency key
 * derived from (accountId, planSlug, billingCycle, dayBucket). A user
 * who triple-clicks "Subscribe" within the same day gets the same
 * session URL instead of three open subscriptions. The dayBucket lets
 * tomorrow's checkout still succeed if today's expired.
 */

import type Stripe from "stripe";
import { prisma } from "@secretlobby/db/client";
import { getStripeClient } from "./client.server.js";

export class BillingError extends Error {
  code:
    | "PLAN_NOT_FOUND"
    | "PRICE_NOT_CONFIGURED"
    | "ACCOUNT_NOT_FOUND"
    | "NO_OWNER_EMAIL"
    | "ALREADY_HAS_CUSTOMER"
    | "NO_STRIPE_CUSTOMER"
    | "INVALID_PARAMS";
  constructor(code: BillingError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "BillingError";
  }
}

export type BillingCycle = "monthly" | "yearly";

export interface CreateCheckoutSessionInput {
  accountId: string;
  planSlug: string;
  billingCycle: BillingCycle;
  successUrl: string;
  cancelUrl: string;
  /** Optional override of the customer email captured by Checkout (e.g.
   * during signup before the account owner has confirmed). Default:
   * pull the OWNER's email from the database. We never accept this
   * from the client. */
  customerEmail?: string;
}

export interface CheckoutSessionResult {
  /** Stripe-hosted checkout URL. Redirect the user here. */
  url: string;
  /** Session id, in case the caller wants to log it. Never persisted
   * server-side — Stripe's own retention is sufficient. */
  sessionId: string;
}

/**
 * Look up (or create) the Stripe Customer for an account.
 *
 * Idempotency: if `account.stripeCustomerId` is set we reuse it. If
 * not, we call `customers.create` with an idempotency key derived from
 * the accountId — a retry after a network blip won't create a duplicate
 * customer.
 *
 * The Stripe Customer carries `metadata.accountId` so the webhook
 * handler can reverse-resolve account from customer even when the
 * subscription metadata is missing (e.g. Customer Portal flows).
 */
export async function getOrCreateStripeCustomer(
  accountId: string,
  email: string,
  name?: string | null
): Promise<string> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { id: true, stripeCustomerId: true, name: true },
  });

  if (!account) {
    throw new BillingError("ACCOUNT_NOT_FOUND", `Account ${accountId} not found`);
  }

  if (account.stripeCustomerId) {
    return account.stripeCustomerId;
  }

  const stripe = getStripeClient();
  const customer = await stripe.customers.create(
    {
      email,
      name: name ?? account.name,
      metadata: { accountId },
    },
    {
      // One Customer per account, ever. Reusing the accountId as the
      // idempotency root means concurrent /billing/checkout requests
      // converge on the same Stripe Customer.
      idempotencyKey: `customer:account:${accountId}`,
    }
  );

  await prisma.account.update({
    where: { id: accountId },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
}

/**
 * Create a Stripe Checkout Session for `accountId` to subscribe to
 * the plan identified by `planSlug` on the given billing cycle.
 *
 * Trust boundary: the caller (action handler) only passes user-derived
 * `planSlug` + `billingCycle`. The Stripe price id is looked up from
 * the SubscriptionPlan row server-side. This means even if the client
 * sends `planSlug=ENTERPRISE` while paying for the STARTER price, the
 * server will charge them the canonical ENTERPRISE price (or refuse
 * if it's not configured).
 */
export async function createCheckoutSession(
  input: CreateCheckoutSessionInput
): Promise<CheckoutSessionResult> {
  const { accountId, planSlug, billingCycle, successUrl, cancelUrl } = input;

  if (billingCycle !== "monthly" && billingCycle !== "yearly") {
    throw new BillingError("INVALID_PARAMS", "billingCycle must be monthly or yearly");
  }

  // Resolve plan & price from DB. SubscriptionPlan is the source of
  // truth — the Stripe price id is mirrored from there.
  const plan = await prisma.subscriptionPlan.findUnique({
    where: { slug: planSlug },
  });

  if (!plan || !plan.isActive) {
    throw new BillingError("PLAN_NOT_FOUND", `Plan '${planSlug}' not found or inactive`);
  }

  const priceId =
    billingCycle === "yearly" ? plan.stripePriceYearly : plan.stripePriceMonthly;

  if (!priceId) {
    throw new BillingError(
      "PRICE_NOT_CONFIGURED",
      `No Stripe price configured for plan '${planSlug}' (${billingCycle}). ` +
        `Sync the plan from the super-admin Plans page.`
    );
  }

  // Resolve the owner email for the Customer. We pull it from the
  // database rather than the session so a session compromised by
  // cookie theft can't redirect billing to an attacker-controlled
  // email.
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      name: true,
      stripeCustomerId: true,
      users: {
        where: { role: "OWNER" },
        take: 1,
        select: { user: { select: { email: true, name: true } } },
      },
    },
  });

  if (!account) {
    throw new BillingError("ACCOUNT_NOT_FOUND", `Account ${accountId} not found`);
  }

  const ownerEmail = input.customerEmail ?? account.users[0]?.user.email;
  if (!ownerEmail) {
    throw new BillingError(
      "NO_OWNER_EMAIL",
      `Account ${accountId} has no owner email — cannot start checkout`
    );
  }

  const customerId = await getOrCreateStripeCustomer(
    accountId,
    ownerEmail,
    account.users[0]?.user.name ?? account.name
  );

  const stripe = getStripeClient();

  // Per-day idempotency key. A user double-clicking Subscribe within
  // the same UTC day gets the SAME checkout session back, not a new
  // one. Stripe's idempotency keys are scoped to ~24h on their side
  // anyway.
  const dayBucket = new Date().toISOString().slice(0, 10);
  const idempotencyKey = `checkout:${accountId}:${planSlug}:${billingCycle}:${dayBucket}`;

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    customer: customerId,
    // Lock the customer to the row we know about. Without this,
    // Stripe Checkout could prompt the user to "create a new account"
    // which would split billing across two Customer objects.
    customer_update: { name: "auto", address: "auto" },
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    // metadata is mirrored on both the Session and the resulting
    // Subscription so the webhook handler has it regardless of which
    // event arrives first.
    metadata: {
      accountId,
      planSlug,
      billingCycle,
    },
    subscription_data: {
      metadata: {
        accountId,
        planSlug,
        billingCycle,
      },
    },
    allow_promotion_codes: true,
    automatic_tax: { enabled: false },
  };

  const session = await stripe.checkout.sessions.create(params, {
    idempotencyKey,
  });

  if (!session.url) {
    throw new BillingError(
      "INVALID_PARAMS",
      "Stripe Checkout session was created without a URL"
    );
  }

  return { url: session.url, sessionId: session.id };
}

export interface CreateCustomerPortalSessionInput {
  accountId: string;
  returnUrl: string;
}

/**
 * Open a Stripe Customer Portal session for self-service management
 * of payment methods, invoices, and subscription cancellation.
 *
 * The Customer Portal will let the user cancel or downgrade their
 * subscription. Those actions emit `customer.subscription.updated` /
 * `.deleted` webhooks which our handler picks up — we don't need to
 * mirror the changes synchronously here.
 */
export async function createCustomerPortalSession(
  input: CreateCustomerPortalSessionInput
): Promise<{ url: string }> {
  const account = await prisma.account.findUnique({
    where: { id: input.accountId },
    select: { stripeCustomerId: true },
  });

  if (!account) {
    throw new BillingError(
      "ACCOUNT_NOT_FOUND",
      `Account ${input.accountId} not found`
    );
  }

  if (!account.stripeCustomerId) {
    throw new BillingError(
      "NO_STRIPE_CUSTOMER",
      `Account ${input.accountId} has no Stripe customer — they must subscribe first`
    );
  }

  const stripe = getStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: account.stripeCustomerId,
    return_url: input.returnUrl,
  });

  return { url: session.url };
}
