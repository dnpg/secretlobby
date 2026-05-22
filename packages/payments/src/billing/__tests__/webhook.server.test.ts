/**
 * Tests for `handleStripeWebhook`.
 *
 * We mock the @secretlobby/db module so the suite runs without a
 * database. The mocks expose enough of the prisma client surface to
 * drive the webhook code path:
 *
 *   - stripeWebhookEvent.create (with P2002 simulation)
 *   - stripeWebhookEvent.update
 *   - account.findUnique / update / updateMany
 *   - subscription.findUnique / upsert / update
 *   - subscriptionPlan.findFirst
 *   - paymentHistory.findFirst / create / update
 *   - $transaction (runs the callback with the same mocked client)
 *
 * Test cases:
 *   - Invalid signature → returns { status: "invalid_signature" }.
 *   - First delivery of a known event → applied + ledger insert + processedAt.
 *   - Duplicate delivery (P2002) → returns deduplicated: true, no apply.
 *   - Unhandled event type → ok, deduplicated:false, no ledger insert.
 *   - Stale event (lastEventAt > eventCreatedAt) → skipped.
 *
 * What we do NOT test here (integration-level, would need a real DB):
 *   - Multi-event ordering under concurrent webhook deliveries.
 *   - Actual Prisma transaction isolation semantics.
 *   - Stripe's tolerance window across daylight savings, etc.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHmac } from "crypto";

// `vi.mock` is hoisted to the top of the file — we can't reference
// module-scope bindings from inside its factory. Use `vi.hoisted` to
// expose the mock object to both the factory and the test bodies.
type MockFn = ReturnType<typeof vi.fn>;
interface PrismaMock {
  stripeWebhookEvent: {
    create: MockFn;
    update: MockFn;
    findUnique: MockFn;
    delete: MockFn;
  };
  account: {
    findUnique: MockFn;
    update: MockFn;
    updateMany: MockFn;
  };
  subscription: {
    findUnique: MockFn;
    upsert: MockFn;
    update: MockFn;
  };
  subscriptionPlan: {
    findFirst: MockFn;
  };
  paymentHistory: {
    findFirst: MockFn;
    create: MockFn;
    update: MockFn;
  };
  $transaction: MockFn;
}

const { prismaMock } = vi.hoisted(() => {
  const mock: PrismaMock = {
    stripeWebhookEvent: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    account: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    subscription: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    subscriptionPlan: { findFirst: vi.fn() },
    paymentHistory: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  };
  // The transaction stub re-uses the same mock as the "tx" client.
  mock.$transaction.mockImplementation(
    async (cb: (tx: PrismaMock) => Promise<unknown>) => cb(mock)
  );
  return { prismaMock: mock };
});

vi.mock("@secretlobby/db", () => ({
  prisma: prismaMock,
  Prisma: {},
  SubscriptionTier: {} as Record<string, string>,
}));

// Now import the module under test.
import { handleStripeWebhook } from "../webhook.server.js";
import { __resetStripeClientForTests } from "../client.server.js";

const SECRET = "whsec_dummy_for_vitest";

function makeStripeSignature(
  body: string,
  secret = SECRET,
  timestamp = Math.floor(Date.now() / 1000)
): string {
  const payload = `${timestamp}.${body}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `t=${timestamp},v1=${sig}`;
}

function makeSubscriptionEvent(
  type:
    | "customer.subscription.created"
    | "customer.subscription.updated"
    | "customer.subscription.deleted",
  overrides: Record<string, unknown> = {}
): string {
  const periodStart = Math.floor(Date.now() / 1000);
  const periodEnd = periodStart + 30 * 24 * 60 * 60;
  return JSON.stringify({
    id: `evt_${type.replace(/\./g, "_")}_${Date.now()}`,
    object: "event",
    type,
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: {
      object: {
        id: "sub_test_001",
        object: "subscription",
        customer: "cus_test_001",
        status: "active",
        cancel_at_period_end: false,
        metadata: { accountId: "acct_test_001" },
        items: {
          data: [
            {
              id: "si_test_001",
              current_period_start: periodStart,
              current_period_end: periodEnd,
              price: {
                id: "price_test_monthly",
                recurring: { interval: "month" },
              },
            },
          ],
        },
        ...overrides,
      },
    },
  });
}

describe("handleStripeWebhook", () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy_for_vitest";
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    __resetStripeClientForTests();
    vi.clearAllMocks();

    // Default happy-path mock responses.
    prismaMock.stripeWebhookEvent.create.mockResolvedValue({
      id: "wevt_row_1",
    });
    prismaMock.stripeWebhookEvent.update.mockResolvedValue({});
    prismaMock.stripeWebhookEvent.findUnique.mockResolvedValue(null);
    prismaMock.stripeWebhookEvent.delete.mockResolvedValue({});
    prismaMock.account.findUnique.mockResolvedValue({ id: "acct_test_001" });
    prismaMock.account.update.mockResolvedValue({});
    prismaMock.account.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    prismaMock.subscription.upsert.mockResolvedValue({});
    prismaMock.subscription.update.mockResolvedValue({});
    prismaMock.subscriptionPlan.findFirst.mockImplementation(async (args) => {
      // resolvePlanByPriceId calls findFirst twice — first checking
      // stripePriceMonthly, then stripePriceYearly. Return a match on
      // the first call for price_test_monthly.
      const where = (args?.where ?? {}) as Record<string, unknown>;
      if (where.stripePriceMonthly === "price_test_monthly") {
        return { id: "plan_starter", slug: "STARTER" };
      }
      return null;
    });
    prismaMock.paymentHistory.findFirst.mockResolvedValue(null);
    prismaMock.paymentHistory.create.mockResolvedValue({});
  });

  it("returns invalid_signature when the header is missing", async () => {
    const result = await handleStripeWebhook({
      rawBody: makeSubscriptionEvent("customer.subscription.created"),
      signatureHeader: null,
    });
    expect(result.status).toBe("invalid_signature");
    // Nothing should have been written.
    expect(prismaMock.stripeWebhookEvent.create).not.toHaveBeenCalled();
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
  });

  it("returns invalid_signature when the body has been tampered", async () => {
    const body = makeSubscriptionEvent("customer.subscription.created");
    const header = makeStripeSignature(body);
    const tampered = body.replace("acct_test_001", "acct_attacker");
    const result = await handleStripeWebhook({
      rawBody: tampered,
      signatureHeader: header,
    });
    expect(result.status).toBe("invalid_signature");
    expect(prismaMock.stripeWebhookEvent.create).not.toHaveBeenCalled();
  });

  it("inserts a ledger row and applies subscription.created on first delivery", async () => {
    const body = makeSubscriptionEvent("customer.subscription.created");
    const header = makeStripeSignature(body);

    const result = await handleStripeWebhook({
      rawBody: body,
      signatureHeader: header,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.deduplicated).toBe(false);
    expect(result.applied).toContain(
      "subscription.upsert:applied(sub_test_001, status=ACTIVE)"
    );

    // Ledger row created with the gatewayId/eventId pair.
    expect(prismaMock.stripeWebhookEvent.create).toHaveBeenCalledTimes(1);
    const createArgs = prismaMock.stripeWebhookEvent.create.mock.calls[0][0];
    expect(createArgs.data.gatewayId).toBe("stripe");
    expect(createArgs.data.eventType).toBe("customer.subscription.created");

    // Subscription upserted.
    expect(prismaMock.subscription.upsert).toHaveBeenCalledTimes(1);
    const upsertArgs = prismaMock.subscription.upsert.mock.calls[0][0];
    expect(upsertArgs.create.accountId).toBe("acct_test_001");
    expect(upsertArgs.create.tier).toBe("STARTER");
    expect(upsertArgs.create.gatewayPriceId).toBe("price_test_monthly");
    expect(upsertArgs.create.billingPeriod).toBe("monthly");

    // processedAt stamped at the end of the transaction.
    expect(prismaMock.stripeWebhookEvent.update).toHaveBeenCalledTimes(1);
    const updateArgs = prismaMock.stripeWebhookEvent.update.mock.calls[0][0];
    expect(updateArgs.where.id).toBe("wevt_row_1");
    expect(updateArgs.data.processedAt).toBeInstanceOf(Date);
  });

  it("deduplicates when the prior delivery already completed (processedAt set)", async () => {
    // Simulate Prisma's P2002 unique-constraint error on insert, then
    // the existing row has processedAt set — the prior delivery did
    // finish, so this is a true duplicate Stripe redelivery.
    const err = Object.assign(
      new Error("Unique constraint failed on (gatewayId, eventId)"),
      { code: "P2002" }
    );
    prismaMock.stripeWebhookEvent.create.mockRejectedValueOnce(err);
    prismaMock.stripeWebhookEvent.findUnique.mockResolvedValueOnce({
      id: "wevt_row_existing",
      processedAt: new Date(),
    });

    const body = makeSubscriptionEvent("customer.subscription.created");
    const header = makeStripeSignature(body);

    const result = await handleStripeWebhook({
      rawBody: body,
      signatureHeader: header,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.deduplicated).toBe(true);
    // No subsequent work should have happened.
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    // We did NOT delete (this was a real duplicate, not a retry).
    expect(prismaMock.stripeWebhookEvent.delete).not.toHaveBeenCalled();
  });

  it("retries (does NOT dedupe) when the prior delivery failed (processedAt null)", async () => {
    // C1 regression: a previous delivery hit an error mid-processing
    // and left the ledger row with processedAt=null + error stamped.
    // Stripe's next retry must NOT be silently 200'd — we should
    // delete the stale row and re-process.
    const err = Object.assign(
      new Error("Unique constraint failed on (gatewayId, eventId)"),
      { code: "P2002" }
    );
    // First create() (initial insert) hits P2002. After we delete and
    // re-insert, the second create() resolves normally.
    prismaMock.stripeWebhookEvent.create
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({ id: "wevt_row_2" });
    prismaMock.stripeWebhookEvent.findUnique.mockResolvedValueOnce({
      id: "wevt_row_stale",
      processedAt: null,
    });

    const body = makeSubscriptionEvent("customer.subscription.created");
    const header = makeStripeSignature(body);

    const result = await handleStripeWebhook({
      rawBody: body,
      signatureHeader: header,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.deduplicated).toBe(false);
    expect(result.applied).toContain(
      "subscription.upsert:applied(sub_test_001, status=ACTIVE)"
    );
    // Stale row deleted.
    expect(prismaMock.stripeWebhookEvent.delete).toHaveBeenCalledWith({
      where: { id: "wevt_row_stale" },
    });
    // Re-insert happened (two create calls — first errored, second succeeded).
    expect(prismaMock.stripeWebhookEvent.create).toHaveBeenCalledTimes(2);
    // Apply ran, processedAt stamped on the new row.
    expect(prismaMock.subscription.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.stripeWebhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "wevt_row_2" },
        data: expect.objectContaining({ processedAt: expect.any(Date) }),
      })
    );
  });

  it("rejects live-mode events when configured with a test secret key (livemode mismatch)", async () => {
    // H3: STRIPE_SECRET_KEY=sk_test_* in beforeEach → expectedLivemode=false.
    // An event with livemode:true must be rejected before any DB writes.
    const body = JSON.stringify({
      id: "evt_livemode_mismatch",
      object: "event",
      type: "customer.subscription.created",
      created: Math.floor(Date.now() / 1000),
      livemode: true, // ← mismatch
      data: { object: { id: "sub_x", customer: "cus_x", status: "active", items: { data: [] } } },
    });
    const header = makeStripeSignature(body);

    const result = await handleStripeWebhook({
      rawBody: body,
      signatureHeader: header,
    });

    expect(result.status).toBe("invalid_signature");
    if (result.status !== "invalid_signature") return;
    expect(result.reason).toBe("livemode_mismatch");
    // Critical: no DB writes whatsoever.
    expect(prismaMock.stripeWebhookEvent.create).not.toHaveBeenCalled();
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
  });

  it("acknowledges unhandled event types without writing a ledger row", async () => {
    const body = JSON.stringify({
      id: "evt_test_radar_001",
      object: "event",
      type: "radar.early_fraud_warning.created", // not in HANDLED_EVENT_TYPES
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      data: { object: {} },
    });
    const header = makeStripeSignature(body);

    const result = await handleStripeWebhook({
      rawBody: body,
      signatureHeader: header,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.deduplicated).toBe(false);
    expect(result.applied).toEqual([]);
    expect(prismaMock.stripeWebhookEvent.create).not.toHaveBeenCalled();
  });

  it("skips an out-of-order subscription update older than the current row", async () => {
    // Existing row was already updated AFTER this incoming event.
    const futureLastEvent = new Date(Date.now() + 60_000);
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: "sub_row_1",
      accountId: "acct_test_001",
      tier: "PRO",
      lastEventAt: futureLastEvent,
      status: "ACTIVE",
      planId: "plan_pro",
    });

    const body = makeSubscriptionEvent("customer.subscription.updated");
    const header = makeStripeSignature(body);

    const result = await handleStripeWebhook({
      rawBody: body,
      signatureHeader: header,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.applied).toContain(
      "subscription.upsert:skipped_stale_event(sub_test_001)"
    );
    // We should NOT have upserted.
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
    // Ledger row still gets processedAt — we're done with it.
    expect(prismaMock.stripeWebhookEvent.update).toHaveBeenCalledTimes(1);
  });

  it("downgrades the account to FREE on subscription.deleted", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: "sub_row_1",
      accountId: "acct_test_001",
      tier: "STARTER",
      status: "ACTIVE",
      lastEventAt: null,
      planId: "plan_starter",
    });

    const body = makeSubscriptionEvent("customer.subscription.deleted", {
      status: "canceled",
    });
    const header = makeStripeSignature(body);

    const result = await handleStripeWebhook({
      rawBody: body,
      signatureHeader: header,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.applied).toContain("subscription.deleted:applied(sub_test_001)");
    expect(prismaMock.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sub_row_1" },
        data: expect.objectContaining({ status: "CANCELLED" }),
      })
    );
    expect(prismaMock.account.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "acct_test_001" },
        data: { subscriptionTier: "FREE" },
      })
    );
  });
});
