/**
 * Environment access for the billing module.
 *
 * Server-only. These variables must NEVER reach the client bundle:
 *   - STRIPE_SECRET_KEY      — full API access, can charge/refund.
 *   - STRIPE_WEBHOOK_SECRET  — anyone with this can forge webhooks.
 *
 * Helpers throw at first read with a useful message rather than the
 * default `undefined` propagating through to a confusing Stripe SDK
 * error later. We don't cache the values so that test code can rotate
 * them between tests; the Stripe client itself is cached in client.server.ts.
 */

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export class MissingStripeConfigError extends Error {
  constructor(name: string) {
    super(
      `Missing required environment variable: ${name}. ` +
        `See .env.example for setup instructions.`
    );
    this.name = "MissingStripeConfigError";
  }
}

export function getStripeSecretKey(): string {
  const value = readEnv("STRIPE_SECRET_KEY");
  if (!value) throw new MissingStripeConfigError("STRIPE_SECRET_KEY");
  return value;
}

export function getStripeWebhookSecret(): string {
  const value = readEnv("STRIPE_WEBHOOK_SECRET");
  if (!value) throw new MissingStripeConfigError("STRIPE_WEBHOOK_SECRET");
  return value;
}

/** Publishable key — safe to expose to the client. */
export function getStripePublishableKey(): string | null {
  return readEnv("STRIPE_PUBLISHABLE_KEY") ?? null;
}

/** True if billing is fully configured. UI uses this to gate upgrade CTAs. */
export function isBillingConfigured(): boolean {
  return Boolean(
    readEnv("STRIPE_SECRET_KEY") && readEnv("STRIPE_WEBHOOK_SECRET")
  );
}

/**
 * Expected `event.livemode` value for this deployment, derived from the
 * configured Stripe secret key prefix.
 *
 *   sk_live_*  → true  (production key; reject test-mode events)
 *   sk_test_*  → false (test key; reject live-mode events)
 *
 * Returns `null` for non-standard prefixes (e.g. restricted keys
 * `rk_live_*` / `rk_test_*` are accepted by also matching `live`/`test`)
 * so callers can skip the check rather than reject every event when the
 * prefix is unrecognized.
 *
 * Used by the webhook handler to detect a misconfigured deployment
 * (prod env pointed at a test secret) BEFORE processing the event body —
 * otherwise an attacker can drive prod state with stock Stripe test
 * fixtures.
 */
export function getExpectedStripeLivemode(): boolean | null {
  const key = readEnv("STRIPE_SECRET_KEY");
  if (!key) return null;
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_")) return true;
  if (key.startsWith("sk_test_") || key.startsWith("rk_test_")) return false;
  return null;
}

/**
 * Compute the configured base URL the app is reachable at (e.g.
 * `https://app.secretlobby.co`). Used to build absolute Stripe
 * Checkout `success_url` / `cancel_url`s that don't depend on the
 * inbound `Host` header — otherwise a misconfigured proxy that
 * forwards an attacker-controlled Host could turn the success page
 * into an open redirect to `evil.com/billing/success`.
 *
 * Fails closed: throws when unset. Callers SHOULD NOT fall back to
 * request URL derivation.
 *
 * Accepts and normalises trailing slashes (`https://app.example.com/`
 * → `https://app.example.com`).
 */
export function getAppBaseUrl(): string {
  const value = readEnv("APP_BASE_URL");
  if (!value) throw new MissingStripeConfigError("APP_BASE_URL");
  // Validate it's an absolute http(s) URL.
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      `APP_BASE_URL is not a valid URL: ${JSON.stringify(value)}`
    );
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(
      `APP_BASE_URL must be http(s); got ${JSON.stringify(parsed.protocol)}`
    );
  }
  // Strip any trailing slash so callers can do `${base}/billing`.
  return value.replace(/\/+$/, "");
}
