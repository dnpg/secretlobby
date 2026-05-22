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
