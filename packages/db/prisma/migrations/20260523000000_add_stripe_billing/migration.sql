-- Stripe billing hardening: webhook idempotency ledger + Subscription
-- columns required by the new packages/payments/src/billing module.
--
-- What this migration adds:
--   1. StripeWebhookEvent — idempotency table for gateway webhook events.
--      We INSERT a row keyed by (gatewayId, eventId) BEFORE running any
--      side effects. A unique-violation means "we have already seen this
--      event" and the handler returns 200 without further work. The
--      processedAt column is set inside the same transaction as the
--      Subscription/PaymentHistory mutations, so partial work is
--      impossible — failures leave processedAt NULL and Stripe will
--      redeliver until we succeed.
--   2. Subscription.lastEventAt — stamp of the most recent Stripe event
--      (event.created) we have applied. Required to ignore out-of-order
--      deliveries — `customer.subscription.created` can arrive after
--      `customer.subscription.updated` and must not downgrade newer
--      state. The webhook handler refuses to apply an event whose
--      eventCreatedAt is older than lastEventAt.
--   3. Subscription.planId — FK to SubscriptionPlan so the
--      "what plan is this account on" question has a single canonical
--      answer. Nullable for backward compat with rows that predate this.
--   4. Subscription.gatewayPriceId — the Stripe price the row is
--      currently billed on. Used to reconcile after Customer-Portal
--      driven plan changes that don't come with metadata.
--   5. SubscriptionPlan indexes on stripePriceMonthly / stripePriceYearly
--      so the webhook can resolve "incoming price_id -> plan" in O(log n)
--      without a full scan.
--
-- Why a dedicated table for idempotency (vs. relying on a column on
-- Subscription): some events (invoice.payment_failed for a customer that
-- has no Subscription row yet because the .created webhook hasn't
-- arrived) need a place to record the dedupe key regardless of which
-- domain row they touch.

-- CreateTable: idempotency ledger
CREATE TABLE "StripeWebhookEvent" (
    "id"             TEXT NOT NULL,
    "gatewayId"      TEXT NOT NULL,
    "eventId"        TEXT NOT NULL,
    "eventType"      TEXT NOT NULL,
    "eventCreatedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt"    TIMESTAMP(3),
    "error"          TEXT,

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- The idempotency key. A second delivery of the same (gateway, eventId)
-- will hit this constraint and be a no-op.
CREATE UNIQUE INDEX "StripeWebhookEvent_gatewayId_eventId_key"
    ON "StripeWebhookEvent"("gatewayId", "eventId");
CREATE INDEX "StripeWebhookEvent_eventType_idx"
    ON "StripeWebhookEvent"("eventType");
CREATE INDEX "StripeWebhookEvent_receivedAt_idx"
    ON "StripeWebhookEvent"("receivedAt");

-- AlterTable: Subscription
ALTER TABLE "Subscription"
    ADD COLUMN "planId"         TEXT,
    ADD COLUMN "gatewayPriceId" TEXT,
    ADD COLUMN "lastEventAt"    TIMESTAMP(3);

-- Foreign key to plan catalog.
ALTER TABLE "Subscription"
    ADD CONSTRAINT "Subscription_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Subscription_planId_idx" ON "Subscription"("planId");

-- Fast lookup of plan by Stripe price id during webhook ingest.
CREATE INDEX "SubscriptionPlan_stripePriceMonthly_idx"
    ON "SubscriptionPlan"("stripePriceMonthly");
CREATE INDEX "SubscriptionPlan_stripePriceYearly_idx"
    ON "SubscriptionPlan"("stripePriceYearly");
