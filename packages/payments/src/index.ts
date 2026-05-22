/**
 * @secretlobby/payments
 *
 * Flexible multi-gateway payment system supporting Stripe, PayPal, and more.
 */

// Types
export type {
  PaymentGateway,
  CheckoutParams,
  CheckoutResult,
  SubscriptionParams,
  SubscriptionResult,
  UpdateSubscriptionParams,
  CustomerParams,
  CustomerPortalResult,
  PaymentMethodInfo,
  PaymentRecord,
  PaymentStatus,
  WebhookEvent,
  WebhookEventType,
  WebhookEventData,
  SubscriptionTier,
  SubscriptionStatus,
  GatewayConfig,
  AvailableGateway,
} from './types.js';

// Constants
export { SUBSCRIPTION_TIERS } from './types.js';

// Manager
export { paymentManager, PaymentGatewayManager } from './manager.js';

// Gateways
export { stripeGateway, getStripeClient, getStripePublishableKey } from './gateways/stripe.js';
export { paypalGateway } from './gateways/paypal.js';
export { registerAllGateways, registerConfiguredGateways } from './gateways/index.js';

// Webhook Handler (legacy normalized-event abstraction)
export { processWebhookEvent, type WebhookHandlerResult } from './webhooks/handler.js';

// Billing — Stripe subscription API. Prefer this over the legacy
// `paymentManager` for new code; the gateway abstraction will be
// retired once everything is migrated.
export {
  // env / client
  getStripeClient as getBillingStripeClient,
  getStripePublishableKey as getBillingPublishableKey,
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
