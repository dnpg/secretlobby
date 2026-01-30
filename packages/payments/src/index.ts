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

// Webhook Handler
export { processWebhookEvent, type WebhookHandlerResult } from './webhooks/handler.js';
