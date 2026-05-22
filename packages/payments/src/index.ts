/**
 * @secretlobby/payments
 *
 * Stripe subscription billing API. The earlier multi-gateway abstraction
 * (paymentManager + stripeGateway + paypalGateway + the normalized webhook
 * handler) was retired alongside the security-review follow-up — the
 * `./billing` module is now the only entry point.
 *
 * If you need a second gateway, build it as a peer of `./billing` rather
 * than reviving the old abstraction; the legacy design was load-bearing
 * for env-driven price IDs that no longer exist (SubscriptionPlan rows
 * carry stripePriceMonthly/Yearly now).
 */

// Billing — Stripe subscription API.
export {
  // env / client
  getStripeClient,
  getStripePublishableKey,
  isBillingConfigured,
  MissingStripeConfigError,
  // signature
  verifyWebhookSignature,
  InvalidWebhookSignatureError,
  // checkout / portal
  createCheckoutSession,
  createCustomerPortalSession,
  getOrCreateStripeCustomer,
  BillingError,
  type BillingCycle,
  type CreateCheckoutSessionInput,
  type CheckoutSessionResult,
  // subscription read
  getCurrentSubscription,
  enforceAccountLimit,
  type CurrentSubscription,
  type LimitKind,
  type LimitCheckResult,
  // webhook
  handleStripeWebhook,
  type WebhookResult,
  type HandleWebhookOptions,
} from './billing/index.js';
