/**
 * Payment Gateway Types and Interfaces
 *
 * This module defines the core abstractions for the payment gateway system,
 * allowing multiple payment providers to be used interchangeably.
 */

// ============================================================================
// Subscription Tiers
// ============================================================================

export interface SubscriptionTier {
  id: string;
  name: string;
  description: string;
  priceMonthly: number; // In cents
  priceYearly: number; // In cents
  features: string[];
  highlighted?: boolean;
}

export const SUBSCRIPTION_TIERS: Record<string, SubscriptionTier> = {
  FREE: {
    id: 'FREE',
    name: 'Free',
    description: 'Get started with basic features',
    priceMonthly: 0,
    priceYearly: 0,
    features: [
      'Up to 5 songs',
      'Basic analytics',
      'Standard audio quality',
      'Community support',
    ],
  },
  STARTER: {
    id: 'STARTER',
    name: 'Starter',
    description: 'Perfect for emerging artists',
    priceMonthly: 999, // $9.99
    priceYearly: 9990, // $99.90 (2 months free)
    features: [
      'Up to 50 songs',
      'Advanced analytics',
      'High quality audio',
      'Custom branding',
      'Email support',
    ],
  },
  PRO: {
    id: 'PRO',
    name: 'Pro',
    description: 'For serious musicians and bands',
    priceMonthly: 2499, // $24.99
    priceYearly: 24990, // $249.90 (2 months free)
    features: [
      'Unlimited songs',
      'Premium analytics',
      'Lossless audio quality',
      'Custom domain',
      'Priority support',
      'API access',
    ],
    highlighted: true,
  },
  ENTERPRISE: {
    id: 'ENTERPRISE',
    name: 'Enterprise',
    description: 'For labels and large organizations',
    priceMonthly: 9999, // $99.99
    priceYearly: 99990, // $999.90 (2 months free)
    features: [
      'Everything in Pro',
      'Multiple accounts',
      'Dedicated account manager',
      'Custom integrations',
      'SLA guarantee',
      'White-label options',
    ],
  },
};

// ============================================================================
// Checkout Types
// ============================================================================

export interface CheckoutParams {
  accountId: string;
  tierId: string;
  billingPeriod: 'monthly' | 'yearly';
  successUrl: string;
  cancelUrl: string;
  customerId?: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
}

export interface CheckoutResult {
  checkoutUrl: string;
  sessionId: string;
}

// ============================================================================
// Subscription Types
// ============================================================================

export interface SubscriptionParams {
  accountId: string;
  customerId: string;
  tierId: string;
  billingPeriod: 'monthly' | 'yearly';
  paymentMethodId?: string;
}

export interface SubscriptionResult {
  subscriptionId: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

export interface UpdateSubscriptionParams {
  tierId?: string;
  billingPeriod?: 'monthly' | 'yearly';
  cancelAtPeriodEnd?: boolean;
}

export type SubscriptionStatus =
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'paused'
  | 'trialing'
  | 'incomplete'
  | 'incomplete_expired';

// ============================================================================
// Customer Types
// ============================================================================

export interface CustomerParams {
  accountId: string;
  email: string;
  name?: string;
  metadata?: Record<string, string>;
}

export interface CustomerPortalResult {
  url: string;
}

// ============================================================================
// Payment Method Types
// ============================================================================

export interface PaymentMethodInfo {
  id: string;
  type: 'card' | 'paypal' | 'bank_account' | 'other';
  last4?: string;
  brand?: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
}

// ============================================================================
// Payment History Types
// ============================================================================

export interface PaymentRecord {
  id: string;
  amount: number; // In cents
  currency: string;
  status: PaymentStatus;
  description?: string;
  createdAt: Date;
  invoiceUrl?: string;
  receiptUrl?: string;
}

export type PaymentStatus = 'succeeded' | 'pending' | 'failed' | 'refunded';

// ============================================================================
// Webhook Types
// ============================================================================

export type WebhookEventType =
  | 'checkout.completed'
  | 'subscription.created'
  | 'subscription.updated'
  | 'subscription.cancelled'
  | 'subscription.paused'
  | 'subscription.resumed'
  | 'payment.succeeded'
  | 'payment.failed'
  | 'customer.created'
  | 'customer.updated';

export interface WebhookEvent {
  id: string;
  type: WebhookEventType;
  gatewayId: string;
  gatewayEventId: string;
  accountId?: string;
  data: WebhookEventData;
  createdAt: Date;
}

export interface WebhookEventData {
  subscriptionId?: string;
  customerId?: string;
  paymentId?: string;
  amount?: number;
  currency?: string;
  tierId?: string;
  status?: string;
  metadata?: Record<string, string>;
  [key: string]: unknown;
}

// ============================================================================
// Payment Gateway Interface
// ============================================================================

export interface PaymentGateway {
  /** Unique identifier for this gateway (e.g., 'stripe', 'paypal') */
  id: string;

  /** Human-readable name */
  name: string;

  /** Icon identifier or URL */
  icon: string;

  /** Check if the gateway is properly configured with required credentials */
  isConfigured(): boolean;

  // Checkout
  /** Create a checkout session for subscription purchase */
  createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult>;

  // Subscriptions
  /** Create a new subscription directly (if supported) */
  createSubscription(params: SubscriptionParams): Promise<SubscriptionResult>;

  /** Update an existing subscription */
  updateSubscription(
    subscriptionId: string,
    params: UpdateSubscriptionParams
  ): Promise<SubscriptionResult>;

  /** Cancel a subscription */
  cancelSubscription(subscriptionId: string, immediately?: boolean): Promise<void>;

  /** Pause a subscription (if supported) */
  pauseSubscription?(subscriptionId: string): Promise<void>;

  /** Resume a paused subscription */
  resumeSubscription?(subscriptionId: string): Promise<void>;

  /** Get subscription details */
  getSubscription(subscriptionId: string): Promise<SubscriptionResult | null>;

  // Customer management
  /** Create a new customer in the gateway */
  createCustomer(params: CustomerParams): Promise<string>;

  /** Get customer portal URL for self-service management */
  getCustomerPortalUrl(customerId: string, returnUrl: string): Promise<CustomerPortalResult>;

  /** Get customer's payment methods */
  getPaymentMethods(customerId: string): Promise<PaymentMethodInfo[]>;

  // Webhooks
  /** Verify and parse webhook payload */
  handleWebhook(payload: string | Buffer, signature: string): Promise<WebhookEvent>;
}

// ============================================================================
// Gateway Manager Types
// ============================================================================

export interface GatewayConfig {
  enabled: boolean;
  isDefault?: boolean;
}

export interface AvailableGateway {
  id: string;
  name: string;
  icon: string;
  isConfigured: boolean;
  isDefault: boolean;
}
