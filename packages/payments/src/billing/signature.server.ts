/**
 * Webhook signature verification.
 *
 * Stripe signs the EXACT bytes of the HTTP body — not the parsed JSON.
 * The caller MUST pass the raw body string (or Buffer) it read off the
 * wire. Anything that has been through JSON.parse + stringify is *not*
 * byte-identical and will fail verification.
 *
 * We delegate to `Stripe.webhooks.constructEvent` rather than rolling
 * our own HMAC — Stripe's implementation has been audited and handles
 * timing-safe comparison, timestamp tolerance for replay protection,
 * and multi-secret rotation (`whsec1,whsec2`) for us.
 *
 * The wrapper exists for two reasons:
 *   1. Centralize the secret read so callers can't accidentally pass
 *      a wrong-shaped key.
 *   2. Wrap Stripe's `StripeSignatureVerificationError` in a typed
 *      `InvalidWebhookSignatureError` that callers can `instanceof`
 *      without importing the Stripe namespace.
 */

import type Stripe from "stripe";
import { getStripeClient } from "./client.server.js";
import { getStripeWebhookSecret } from "./env.server.js";

export class InvalidWebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWebhookSignatureError";
  }
}

/**
 * Verify a Stripe webhook signature and return the parsed event.
 *
 * @param rawBody  Exact bytes of the request body. Use `request.text()`
 *                 in a React Router action — `request.json()` will silently
 *                 re-serialize and break signature verification.
 * @param header   Value of the `Stripe-Signature` header from the
 *                 incoming request. May be `null`/`undefined`; we throw.
 * @param options.tolerance  Replay window in seconds. Defaults to
 *                 Stripe's recommendation of 300s. Don't set higher
 *                 unless you have a very specific reason — it widens
 *                 the replay attack window.
 *
 * @throws InvalidWebhookSignatureError if the signature, timestamp, or
 *         body fails verification, or if the header is missing.
 */
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  header: string | null | undefined,
  options: { tolerance?: number } = {}
): Stripe.Event {
  if (!header || typeof header !== "string" || header.trim().length === 0) {
    throw new InvalidWebhookSignatureError(
      "Missing Stripe-Signature header"
    );
  }

  const stripe = getStripeClient();
  const secret = getStripeWebhookSecret();

  try {
    return stripe.webhooks.constructEvent(
      rawBody,
      header,
      secret,
      options.tolerance ?? 300
    );
  } catch (err) {
    // Stripe throws StripeSignatureVerificationError; we never expose
    // the underlying message because it can leak secret-prefix info on
    // some SDK versions. The original error is preserved as `cause`
    // for server-side logging.
    const wrapped = new InvalidWebhookSignatureError(
      "Stripe webhook signature verification failed"
    );
    (wrapped as Error & { cause?: unknown }).cause = err;
    throw wrapped;
  }
}
