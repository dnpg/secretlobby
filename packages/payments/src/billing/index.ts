/**
 * @secretlobby/payments/billing
 *
 * Server-only Stripe subscription billing API. Importing this module
 * from a client bundle will fail (and it should — it transitively
 * imports STRIPE_SECRET_KEY accessors).
 *
 * Public surface (security audit boundary):
 *
 *   - getStripeClient()             — SDK accessor; lazy; throws if no key
 *   - verifyWebhookSignature()      — wraps Stripe.webhooks.constructEvent
 *   - createCheckoutSession()       — secure checkout creation, server-resolved
 *   - createCustomerPortalSession() — manage existing subscription
 *   - getCurrentSubscription()      — single source of truth for plan state
 *   - enforceAccountLimit()         — plan-gating helper for lobbies/songs
 *   - handleStripeWebhook()         — full webhook entry point (verify+dedupe+apply)
 *
 * All functions throw `BillingError`, `MissingStripeConfigError`, or
 * `InvalidWebhookSignatureError` on the corresponding failure modes.
 */

export { getStripeClient } from "./client.server.js";
export {
  getStripeSecretKey,
  getStripeWebhookSecret,
  getStripePublishableKey,
  isBillingConfigured,
  MissingStripeConfigError,
} from "./env.server.js";
export {
  verifyWebhookSignature,
  InvalidWebhookSignatureError,
} from "./signature.server.js";
export {
  createCheckoutSession,
  createCustomerPortalSession,
  getOrCreateStripeCustomer,
  BillingError,
  type BillingCycle,
  type CreateCheckoutSessionInput,
  type CheckoutSessionResult,
  type CreateCustomerPortalSessionInput,
} from "./checkout.server.js";
export {
  getCurrentSubscription,
  enforceAccountLimit,
  type CurrentSubscription,
  type LimitKind,
  type LimitCheckResult,
} from "./subscription.server.js";
export {
  handleStripeWebhook,
  type WebhookResult,
  type HandleWebhookOptions,
} from "./webhook.server.js";
