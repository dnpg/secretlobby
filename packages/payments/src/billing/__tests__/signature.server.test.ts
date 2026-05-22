/**
 * Tests for `verifyWebhookSignature`. We do NOT mock Stripe's
 * `constructEvent` here — that defeats the purpose. Instead we build
 * a real Stripe-style signature with the SAME secret used by the
 * module and verify it round-trips.
 *
 * Coverage:
 *   - Valid signature → returns parsed event.
 *   - Missing header → InvalidWebhookSignatureError, no throw to caller.
 *   - Tampered body → throws InvalidWebhookSignatureError.
 *   - Wrong secret → throws InvalidWebhookSignatureError.
 *   - Stale timestamp (outside tolerance) → throws.
 *
 * Why these matter: every one of these is a documented Stripe webhook
 * attack vector — if the wrapper fails open on any of them we're
 * exposed.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createHmac } from "crypto";
import {
  verifyWebhookSignature,
  InvalidWebhookSignatureError,
} from "../signature.server.js";
import { __resetStripeClientForTests } from "../client.server.js";

const SECRET = "whsec_dummy_for_vitest";

function makeStripeSignature(
  body: string,
  secret: string,
  timestamp: number = Math.floor(Date.now() / 1000)
): string {
  const payload = `${timestamp}.${body}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `t=${timestamp},v1=${sig}`;
}

function buildBody(): string {
  // A minimal valid Stripe event shape. constructEvent only parses
  // top-level type/id/data; we don't need a real payload to test the
  // signature path.
  return JSON.stringify({
    id: "evt_test_signature_001",
    object: "event",
    type: "customer.subscription.updated",
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: "sub_test", items: { data: [] } } },
    livemode: false,
  });
}

describe("verifyWebhookSignature", () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy_for_vitest";
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    __resetStripeClientForTests();
  });

  it("accepts a valid signature over the raw body and returns the parsed event", () => {
    const body = buildBody();
    const header = makeStripeSignature(body, SECRET);
    const event = verifyWebhookSignature(body, header);
    expect(event.id).toBe("evt_test_signature_001");
    expect(event.type).toBe("customer.subscription.updated");
  });

  it("throws InvalidWebhookSignatureError when the header is missing", () => {
    expect(() => verifyWebhookSignature(buildBody(), null)).toThrow(
      InvalidWebhookSignatureError
    );
    expect(() => verifyWebhookSignature(buildBody(), undefined)).toThrow(
      InvalidWebhookSignatureError
    );
    expect(() => verifyWebhookSignature(buildBody(), "")).toThrow(
      InvalidWebhookSignatureError
    );
  });

  it("rejects a tampered body — adding even one byte invalidates the signature", () => {
    const body = buildBody();
    const header = makeStripeSignature(body, SECRET);
    const tamperedBody = body.replace("evt_test_signature_001", "evt_attacker_forged");
    expect(() => verifyWebhookSignature(tamperedBody, header)).toThrow(
      InvalidWebhookSignatureError
    );
  });

  it("rejects a signature computed with a different secret", () => {
    const body = buildBody();
    const wrongHeader = makeStripeSignature(body, "whsec_attacker_guess");
    expect(() => verifyWebhookSignature(body, wrongHeader)).toThrow(
      InvalidWebhookSignatureError
    );
  });

  it("rejects a signature whose timestamp is outside the tolerance window", () => {
    const body = buildBody();
    // 10 minutes ago — outside the default 300s tolerance.
    const staleTs = Math.floor(Date.now() / 1000) - 10 * 60;
    const header = makeStripeSignature(body, SECRET, staleTs);
    expect(() => verifyWebhookSignature(body, header)).toThrow(
      InvalidWebhookSignatureError
    );
  });

  it("accepts a stale timestamp when tolerance is widened", () => {
    const body = buildBody();
    const staleTs = Math.floor(Date.now() / 1000) - 10 * 60;
    const header = makeStripeSignature(body, SECRET, staleTs);
    // Allow 1 hour
    const event = verifyWebhookSignature(body, header, { tolerance: 3600 });
    expect(event.id).toBe("evt_test_signature_001");
  });
});
