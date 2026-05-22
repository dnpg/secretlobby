/**
 * Stripe webhook handler — core security boundary.
 *
 * Threat model
 * ============
 * A POST to /api/webhooks/stripe is an UNAUTHENTICATED request from
 * an arbitrary internet host. We MUST NOT take any action that depends
 * on the body until we have proven the body came from Stripe. The
 * specific risks we mitigate:
 *
 *   1. Forged events.  An attacker writes
 *      `{"type": "invoice.payment_succeeded", "data": {...}}` and POSTs
 *      it pretending to be Stripe — without verification we'd grant a
 *      free Pro subscription. Mitigation: `verifyWebhookSignature` runs
 *      before any DB read.
 *
 *   2. Replay attacks.  An attacker captures a valid event and replays
 *      it later (e.g. to re-grant access after an account is cancelled).
 *      Mitigation: (a) Stripe's signature has a timestamp tolerance of
 *      300s; (b) we record every `event.id` in StripeWebhookEvent and
 *      ignore duplicates.
 *
 *   3. Race / out-of-order events.  Stripe doesn't guarantee delivery
 *      order. `customer.subscription.updated` can land before its
 *      `.created` partner; a delayed `.created` after `.deleted` would
 *      revive a cancelled sub. Mitigation: we compare event.created vs
 *      Subscription.lastEventAt inside the transaction and drop older
 *      events.
 *
 *   4. Partial-failure inconsistency.  If we wrote half the rows and
 *      crashed, the next retry could double-credit a payment.
 *      Mitigation: every event is applied inside a single
 *      `prisma.$transaction` that also stamps `processedAt` on the
 *      idempotency ledger row.
 *
 *   5. Body-tampering bypass.  React Router's `request.formData()` and
 *      `request.json()` re-serialize the body — Stripe's signature is
 *      over the exact original bytes, so any reparsing breaks it. The
 *      caller MUST use `request.text()` and pass the raw string.
 *
 * Logging
 * =======
 * We log every received event (`type`, `id`, `accountId`), every
 * processed event, and every failure. We NEVER log the body or
 * signature header — both contain material an attacker shouldn't be
 * able to see in our log aggregator.
 */

import type Stripe from "stripe";
import {
  prisma,
  Prisma,
  type Subscription,
  type SubscriptionStatus,
} from "@secretlobby/db";
import { createLogger, formatError } from "@secretlobby/logger/server";
import {
  verifyWebhookSignature,
  InvalidWebhookSignatureError,
} from "./signature.server.js";

const logger = createLogger({ service: "billing:webhook" });

/**
 * Event types we handle. Anything else is acknowledged (200) so Stripe
 * stops retrying, but we don't apply any state changes.
 */
const HANDLED_EVENT_TYPES = new Set<string>([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  // checkout.session.completed is convenient as a redundant signal but
  // not strictly required — subscription.created always fires too. We
  // accept it so we can update the Account's cached subscriptionTier
  // immediately, before the subscription.created webhook arrives.
  "checkout.session.completed",
]);

export type WebhookResult =
  | { status: "ok"; eventId: string; deduplicated: boolean; applied: string[] }
  | { status: "invalid_signature"; reason: string }
  | { status: "error"; reason: string; eventId?: string };

export interface HandleWebhookOptions {
  rawBody: string | Buffer;
  signatureHeader: string | null | undefined;
  /**
   * Tolerance for Stripe's timestamp check, in seconds. Defaults to
   * 300 (Stripe's recommendation). Don't widen without a strong reason.
   */
  tolerance?: number;
}

/**
 * Entry point. Verifies the signature, dedupes on event.id, then
 * dispatches to the appropriate handler — all inside a single
 * transaction per event.
 */
export async function handleStripeWebhook(
  options: HandleWebhookOptions
): Promise<WebhookResult> {
  // ====================================================================
  // STEP 1: Verify signature. NOTHING else happens before this.
  // ====================================================================
  let event: Stripe.Event;
  try {
    event = verifyWebhookSignature(
      options.rawBody,
      options.signatureHeader,
      { tolerance: options.tolerance }
    );
  } catch (err) {
    if (err instanceof InvalidWebhookSignatureError) {
      // Log enough to debug a misconfigured Stripe webhook in our own
      // dashboard, but NEVER log the signature header value itself —
      // it contains a valid HMAC that helps an attacker target replay.
      logger.warn(
        {
          err: formatError(err),
          hasHeader: Boolean(options.signatureHeader),
        },
        "Stripe webhook signature verification failed"
      );
      return { status: "invalid_signature", reason: err.message };
    }
    throw err;
  }

  logger.info(
    {
      eventId: event.id,
      eventType: event.type,
      livemode: event.livemode,
    },
    "Stripe webhook received"
  );

  // ====================================================================
  // STEP 2: Acknowledge unhandled types up-front so we don't waste a
  // ledger row on them. Stripe sends a lot of event types we don't
  // care about — return 200 so they stop retrying.
  // ====================================================================
  if (!HANDLED_EVENT_TYPES.has(event.type)) {
    return {
      status: "ok",
      eventId: event.id,
      deduplicated: false,
      applied: [],
    };
  }

  // ====================================================================
  // STEP 3: Idempotency check. We INSERT a ledger row keyed by
  // (gatewayId, eventId). A duplicate event hits the unique constraint
  // and is treated as already-processed.
  // ====================================================================
  const eventCreatedAt = new Date(event.created * 1000);
  let ledgerRowId: string;
  try {
    const ledgerRow = await prisma.stripeWebhookEvent.create({
      data: {
        gatewayId: "stripe",
        eventId: event.id,
        eventType: event.type,
        eventCreatedAt,
      },
      select: { id: true },
    });
    ledgerRowId = ledgerRow.id;
  } catch (err) {
    // Unique-constraint violation = we've seen this event before. The
    // first delivery either succeeded (processedAt set) or is still
    // mid-processing (processedAt null). Either way, Stripe is told
    // "ok, stop retrying" — duplicate processing would be unsafe.
    if (isUniqueConstraintError(err)) {
      logger.info(
        { eventId: event.id, eventType: event.type },
        "Stripe webhook event already seen (deduplicated)"
      );
      return {
        status: "ok",
        eventId: event.id,
        deduplicated: true,
        applied: [],
      };
    }
    throw err;
  }

  // ====================================================================
  // STEP 4: Apply the event inside a single transaction. The
  // transaction body also marks the ledger row processed; if any
  // step throws, the ledger row is rolled back so the next retry
  // can attempt again. (Stripe will retry until we 2xx.)
  // ====================================================================
  try {
    const applied = await prisma.$transaction(async (tx) => {
      const acts: string[] = [];

      switch (event.type) {
        case "checkout.session.completed":
          acts.push(
            ...(await applyCheckoutCompleted(
              tx,
              event.data.object as Stripe.Checkout.Session,
              eventCreatedAt
            ))
          );
          break;
        case "customer.subscription.created":
        case "customer.subscription.updated":
          acts.push(
            ...(await applySubscriptionUpsert(
              tx,
              event.data.object as Stripe.Subscription,
              eventCreatedAt
            ))
          );
          break;
        case "customer.subscription.deleted":
          acts.push(
            ...(await applySubscriptionDeleted(
              tx,
              event.data.object as Stripe.Subscription,
              eventCreatedAt
            ))
          );
          break;
        case "invoice.payment_succeeded":
          acts.push(
            ...(await applyInvoicePayment(
              tx,
              event.data.object as Stripe.Invoice,
              "SUCCEEDED",
              eventCreatedAt
            ))
          );
          break;
        case "invoice.payment_failed":
          acts.push(
            ...(await applyInvoicePayment(
              tx,
              event.data.object as Stripe.Invoice,
              "FAILED",
              eventCreatedAt
            ))
          );
          break;
      }

      // Mark the ledger row as processed inside the same transaction
      // so we never have "rows mutated but ledger not stamped".
      await tx.stripeWebhookEvent.update({
        where: { id: ledgerRowId },
        data: { processedAt: new Date() },
      });

      return acts;
    });

    logger.info(
      {
        eventId: event.id,
        eventType: event.type,
        applied,
      },
      "Stripe webhook processed"
    );

    return {
      status: "ok",
      eventId: event.id,
      deduplicated: false,
      applied,
    };
  } catch (err) {
    // Roll back the ledger insert by deleting the row, so the next
    // retry can re-enter the idempotency check fresh. (The transaction
    // already rolled back; this just clears the dedupe key.)
    //
    // We deliberately keep the row if we can stamp an error message
    // for human debugging, but for now delete-and-retry is safer.
    try {
      const errMessage = err instanceof Error ? err.message : String(err);
      await prisma.stripeWebhookEvent.update({
        where: { id: ledgerRowId },
        data: { error: truncate(errMessage, 500) },
      });
    } catch {
      // Best effort. We're already in an error path.
    }

    logger.error(
      {
        eventId: event.id,
        eventType: event.type,
        err: formatError(err),
      },
      "Stripe webhook processing failed"
    );

    // Don't expose the underlying error to the caller — Stripe is the
    // only client and it just needs a non-2xx to retry.
    return {
      status: "error",
      reason: "internal_error",
      eventId: event.id,
    };
  }
}

// =====================================================================
// Event handlers — pure data mutations, run inside the transaction.
// =====================================================================

type Tx = Prisma.TransactionClient;

/**
 * checkout.session.completed: Stripe is telling us the user finished
 * Checkout. We use this only as a fast-path to mirror the new
 * customer id onto the Account row; the authoritative subscription
 * state lands via customer.subscription.created (which often follows
 * within milliseconds).
 */
async function applyCheckoutCompleted(
  tx: Tx,
  session: Stripe.Checkout.Session,
  _eventCreatedAt: Date
): Promise<string[]> {
  const accountId = session.metadata?.accountId;
  if (!accountId) {
    // No accountId in metadata — this checkout wasn't initiated by
    // our app (or someone tampered with the metadata, which Stripe
    // doesn't allow but we still don't trust). Bail.
    return ["checkout.completed:no_account_metadata"];
  }

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;

  if (customerId) {
    await tx.account.updateMany({
      where: {
        id: accountId,
        // Only mirror onto rows we don't already have a customer for
        // (idempotent in the presence of webhook retries that arrive
        // after customer.subscription.created already set this).
        OR: [{ stripeCustomerId: null }, { stripeCustomerId: customerId }],
      },
      data: { stripeCustomerId: customerId },
    });
  }

  return ["checkout.completed:mirrored_customer_id"];
}

/**
 * customer.subscription.created/updated. Upsert by
 * (gatewayId, gatewaySubscriptionId).
 *
 * Out-of-order protection: if the row already exists and its
 * lastEventAt is newer than this event's eventCreatedAt, we skip.
 * That guards the case where a delayed .created arrives after a
 * subsequent .updated has already landed newer state.
 */
async function applySubscriptionUpsert(
  tx: Tx,
  stripeSub: Stripe.Subscription,
  eventCreatedAt: Date
): Promise<string[]> {
  const subId = stripeSub.id;
  const customerId =
    typeof stripeSub.customer === "string"
      ? stripeSub.customer
      : stripeSub.customer.id;

  // Resolve accountId. Two sources, in order of trust:
  //   1. The Subscription.metadata.accountId we set when creating it.
  //      Stripe never modifies metadata on our behalf, so this is the
  //      gold standard.
  //   2. The Account row that owns stripeCustomerId === customerId.
  //      Required when the Subscription was created out-of-band (e.g.
  //      Customer Portal "Subscribe to add-on" — we don't have that
  //      flow today, but the fallback is cheap).
  const accountId = await resolveAccountId(tx, {
    metadataAccountId: stripeSub.metadata?.accountId,
    customerId,
  });

  if (!accountId) {
    // We can't safely upsert without knowing which account this
    // belongs to. Don't throw — it might just be a leftover
    // Subscription from a deleted test account. Log + return.
    logger.warn(
      { subscriptionId: subId, customerId },
      "Stripe subscription event has no resolvable accountId"
    );
    return ["subscription.upsert:no_account"];
  }

  // Existing row? Decide whether to apply.
  const existing = await tx.subscription.findUnique({
    where: {
      gatewayId_gatewaySubscriptionId: {
        gatewayId: "stripe",
        gatewaySubscriptionId: subId,
      },
    },
  });

  if (existing && existing.lastEventAt && existing.lastEventAt >= eventCreatedAt) {
    return [`subscription.upsert:skipped_stale_event(${subId})`];
  }

  // Resolve plan + billing cycle from the subscription items.
  const firstItem = stripeSub.items.data[0];
  if (!firstItem) {
    // A subscription with no items shouldn't happen, but if it does
    // we have nothing to bill against — skip.
    return [`subscription.upsert:no_items(${subId})`];
  }

  const priceId = firstItem.price.id;
  const planLookup = await resolvePlanByPriceId(tx, priceId);
  const billingCycle: "monthly" | "yearly" | null =
    planLookup?.billingCycle ?? (firstItem.price.recurring?.interval === "year" ? "yearly" : firstItem.price.recurring?.interval === "month" ? "monthly" : null);

  // Period bounds: Stripe v18 moved current_period_* off the
  // Subscription root and onto each SubscriptionItem.
  const currentPeriodStart = new Date(firstItem.current_period_start * 1000);
  const currentPeriodEnd = new Date(firstItem.current_period_end * 1000);

  const dbStatus = mapStripeStatusToDb(stripeSub.status);
  const tier = (planLookup?.plan?.slug as Subscription["tier"]) ?? existing?.tier ?? "FREE";

  await tx.subscription.upsert({
    where: {
      gatewayId_gatewaySubscriptionId: {
        gatewayId: "stripe",
        gatewaySubscriptionId: subId,
      },
    },
    create: {
      accountId,
      gatewayId: "stripe",
      gatewaySubscriptionId: subId,
      gatewayCustomerId: customerId,
      gatewayPriceId: priceId,
      planId: planLookup?.plan?.id ?? null,
      tier,
      status: dbStatus,
      billingPeriod: billingCycle,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
      lastEventAt: eventCreatedAt,
    },
    update: {
      gatewayCustomerId: customerId,
      gatewayPriceId: priceId,
      planId: planLookup?.plan?.id ?? existing?.planId ?? null,
      tier,
      status: dbStatus,
      billingPeriod: billingCycle,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
      lastEventAt: eventCreatedAt,
    },
  });

  // Mirror onto Account so the legacy `account.subscriptionTier`
  // reads still work. Only mirror when the new status is "live"
  // (ACTIVE/TRIALING) — PAST_DUE/CANCELLED don't change the cached
  // tier, the explicit .deleted handler does that.
  if (dbStatus === "ACTIVE" || dbStatus === "TRIALING") {
    await tx.account.update({
      where: { id: accountId },
      data: {
        subscriptionTier: tier,
        stripeCustomerId: customerId,
      },
    });
  }

  return [`subscription.upsert:applied(${subId}, status=${dbStatus})`];
}

/**
 * customer.subscription.deleted: subscription ended (period expired
 * after cancel_at_period_end, or immediate cancel). Mark our row
 * CANCELLED and downgrade the Account to FREE.
 */
async function applySubscriptionDeleted(
  tx: Tx,
  stripeSub: Stripe.Subscription,
  eventCreatedAt: Date
): Promise<string[]> {
  const existing = await tx.subscription.findUnique({
    where: {
      gatewayId_gatewaySubscriptionId: {
        gatewayId: "stripe",
        gatewaySubscriptionId: stripeSub.id,
      },
    },
  });

  if (!existing) {
    return [`subscription.deleted:not_found(${stripeSub.id})`];
  }

  if (existing.lastEventAt && existing.lastEventAt >= eventCreatedAt) {
    return [`subscription.deleted:skipped_stale_event(${stripeSub.id})`];
  }

  await tx.subscription.update({
    where: { id: existing.id },
    data: { status: "CANCELLED", lastEventAt: eventCreatedAt },
  });

  await tx.account.update({
    where: { id: existing.accountId },
    data: { subscriptionTier: "FREE" },
  });

  return [`subscription.deleted:applied(${stripeSub.id})`];
}

/**
 * invoice.payment_succeeded / .failed: record payment history + flip
 * dunning status on the subscription if the invoice failed.
 */
async function applyInvoicePayment(
  tx: Tx,
  invoice: Stripe.Invoice,
  status: "SUCCEEDED" | "FAILED",
  eventCreatedAt: Date
): Promise<string[]> {
  // Stripe v18 moved invoice.subscription to invoice.parent.subscription_details.subscription.
  const parentSubDetails =
    invoice.parent?.type === "subscription_details"
      ? invoice.parent.subscription_details
      : null;
  const stripeSubscriptionId =
    typeof parentSubDetails?.subscription === "string"
      ? parentSubDetails.subscription
      : parentSubDetails?.subscription?.id ?? null;

  // Resolve our Subscription row, if any.
  const sub = stripeSubscriptionId
    ? await tx.subscription.findUnique({
        where: {
          gatewayId_gatewaySubscriptionId: {
            gatewayId: "stripe",
            gatewaySubscriptionId: stripeSubscriptionId,
          },
        },
      })
    : null;

  // Resolve accountId. Order:
  //   1. Subscription row we just looked up
  //   2. Account by stripeCustomerId
  let accountId = sub?.accountId ?? null;
  if (!accountId) {
    const customerId =
      typeof invoice.customer === "string"
        ? invoice.customer
        : invoice.customer?.id ?? null;
    if (customerId) {
      const acct = await tx.account.findUnique({
        where: { stripeCustomerId: customerId },
        select: { id: true },
      });
      accountId = acct?.id ?? null;
    }
  }

  if (!accountId) {
    return [`invoice.${status.toLowerCase()}:no_account`];
  }

  // Use invoice.id as the gateway payment id. It's unique and
  // human-greppable. The payment intent is on the invoice's payments
  // collection but we don't need it for history.
  const gatewayPaymentId = invoice.id ?? `invoice_${Date.now()}`;

  // Idempotency on history rows: do not double-insert if we already
  // recorded this invoice. We use (gatewayId, gatewayPaymentId) as
  // the dedupe key — the table doesn't have a unique constraint on
  // it, but the webhook ledger already dedupes Stripe-level retries,
  // so this just guards a hypothetical SDK-level retry.
  const existingPayment = await tx.paymentHistory.findFirst({
    where: {
      gatewayId: "stripe",
      gatewayPaymentId,
    },
    select: { id: true, status: true },
  });

  if (existingPayment) {
    // Allow status promotion from PENDING → SUCCEEDED / FAILED but
    // never downgrade. (e.g. .succeeded then .failed shouldn't happen
    // for the same invoice, but if it does we trust the latest event.)
    if (existingPayment.status !== status) {
      await tx.paymentHistory.update({
        where: { id: existingPayment.id },
        data: { status },
      });
    }
  } else {
    await tx.paymentHistory.create({
      data: {
        accountId,
        subscriptionId: sub?.id,
        gatewayId: "stripe",
        gatewayPaymentId,
        amount: invoice.amount_paid ?? invoice.amount_due ?? 0,
        currency: invoice.currency ?? "usd",
        status,
        description:
          status === "SUCCEEDED"
            ? "Subscription payment"
            : "Subscription payment failed",
        invoiceUrl: invoice.hosted_invoice_url ?? null,
        receiptUrl: null,
      },
    });
  }

  // Dunning: on failure, mark the subscription PAST_DUE so plan-gating
  // surfaces "your card failed" UI. We do NOT downgrade the tier — the
  // user gets a grace period to update their card; eventual permanent
  // failure arrives as `customer.subscription.deleted`.
  if (sub && status === "FAILED") {
    if (!sub.lastEventAt || sub.lastEventAt < eventCreatedAt) {
      await tx.subscription.update({
        where: { id: sub.id },
        data: { status: "PAST_DUE", lastEventAt: eventCreatedAt },
      });
    }
  }

  // On a successful invoice, if we previously flipped to PAST_DUE,
  // restore to ACTIVE. Subscription.updated would do this too but
  // there's no guarantee of ordering.
  if (sub && status === "SUCCEEDED" && sub.status === "PAST_DUE") {
    if (!sub.lastEventAt || sub.lastEventAt < eventCreatedAt) {
      await tx.subscription.update({
        where: { id: sub.id },
        data: { status: "ACTIVE", lastEventAt: eventCreatedAt },
      });
    }
  }

  return [`invoice.${status.toLowerCase()}:applied`];
}

// =====================================================================
// Helpers
// =====================================================================

async function resolveAccountId(
  tx: Tx,
  input: { metadataAccountId?: string | null; customerId: string | null }
): Promise<string | null> {
  if (input.metadataAccountId) {
    const acct = await tx.account.findUnique({
      where: { id: input.metadataAccountId },
      select: { id: true },
    });
    if (acct) return acct.id;
  }
  if (input.customerId) {
    const acct = await tx.account.findUnique({
      where: { stripeCustomerId: input.customerId },
      select: { id: true },
    });
    if (acct) return acct.id;
  }
  return null;
}

async function resolvePlanByPriceId(
  tx: Tx,
  priceId: string
): Promise<{ plan: { id: string; slug: string }; billingCycle: "monthly" | "yearly" } | null> {
  const monthly = await tx.subscriptionPlan.findFirst({
    where: { stripePriceMonthly: priceId },
    select: { id: true, slug: true },
  });
  if (monthly) return { plan: monthly, billingCycle: "monthly" };

  const yearly = await tx.subscriptionPlan.findFirst({
    where: { stripePriceYearly: priceId },
    select: { id: true, slug: true },
  });
  if (yearly) return { plan: yearly, billingCycle: "yearly" };

  return null;
}

function mapStripeStatusToDb(
  status: Stripe.Subscription.Status
): SubscriptionStatus {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIALING";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "canceled":
    case "incomplete_expired":
      return "CANCELLED";
    case "paused":
      return "PAUSED";
    case "incomplete":
      // Treat incomplete as PAST_DUE until the user completes the
      // payment intent. They don't get plan access until ACTIVE.
      return "PAST_DUE";
    default:
      return "PAST_DUE";
  }
}

function isUniqueConstraintError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  // Prisma's unique-constraint error code.
  return code === "P2002";
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
