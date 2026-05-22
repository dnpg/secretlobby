/**
 * Lazy Stripe SDK accessor.
 *
 * The Stripe client is expensive to construct (it pulls in a bunch of
 * URL helpers and warms an HTTPS agent), and at boot time we may not
 * have STRIPE_SECRET_KEY available yet (CI builds, type-check workers).
 * Constructing on first call lets server modules import this file
 * without crashing the process.
 *
 * We cache the client across calls. In dev with HMR this would normally
 * leak a new client per reload — we attach to `globalThis` to dedupe,
 * matching the pattern used by `packages/db/src/client.ts`.
 */

import Stripe from "stripe";
import { getStripeSecretKey } from "./env.server.js";

const globalForStripe = globalThis as unknown as {
  __secretlobby_stripe_client?: Stripe;
};

/**
 * Returns the singleton Stripe client. Throws `MissingStripeConfigError`
 * if STRIPE_SECRET_KEY is not set.
 *
 * Pinned API version: we explicitly pin so server-side behavior is
 * deterministic across SDK upgrades. When bumping Stripe, update the
 * version here AND test the webhook payloads against the new shape.
 */
export function getStripeClient(): Stripe {
  if (globalForStripe.__secretlobby_stripe_client) {
    return globalForStripe.__secretlobby_stripe_client;
  }

  const key = getStripeSecretKey();

  const client = new Stripe(key, {
    // Pin to a known version. Stripe SDK 18.x defaults to a recent
    // version anyway, but pinning protects us from a silent default
    // bump when we upgrade the SDK.
    apiVersion: "2025-09-30.clover" as Stripe.LatestApiVersion,
    typescript: true,
    appInfo: {
      name: "secretlobby",
      url: "https://secretlobby.co",
    },
    // Sensible defaults; Stripe SDK handles retries on idempotent
    // requests automatically when this is > 0.
    maxNetworkRetries: 2,
  });

  globalForStripe.__secretlobby_stripe_client = client;
  return client;
}

/** Test-only: reset the cached client. Never call in production code. */
export function __resetStripeClientForTests(): void {
  globalForStripe.__secretlobby_stripe_client = undefined;
}
