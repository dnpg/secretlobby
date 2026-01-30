/**
 * Stripe Payment Gateway Adapter
 *
 * Implements the PaymentGateway interface for Stripe,
 * providing checkout sessions, subscription management, and webhook handling.
 */

import Stripe from 'stripe';
import type {
  PaymentGateway,
  CheckoutParams,
  CheckoutResult,
  SubscriptionParams,
  SubscriptionResult,
  UpdateSubscriptionParams,
  CustomerParams,
  CustomerPortalResult,
  PaymentMethodInfo,
  WebhookEvent,
  WebhookEventType,
  SubscriptionStatus,
  SUBSCRIPTION_TIERS,
} from '../types.js';

// ============================================================================
// Environment Variables
// ============================================================================

function getEnvOrThrow(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getEnvOrNull(name: string): string | null {
  return process.env[name] || null;
}

// ============================================================================
// Stripe Price ID Configuration
// ============================================================================

export interface StripePriceIds {
  STARTER_MONTHLY: string;
  STARTER_YEARLY: string;
  PRO_MONTHLY: string;
  PRO_YEARLY: string;
  ENTERPRISE_MONTHLY: string;
  ENTERPRISE_YEARLY: string;
}

function getPriceIds(): StripePriceIds | null {
  const starterMonthly = getEnvOrNull('STRIPE_PRICE_STARTER_MONTHLY');
  const starterYearly = getEnvOrNull('STRIPE_PRICE_STARTER_YEARLY');
  const proMonthly = getEnvOrNull('STRIPE_PRICE_PRO_MONTHLY');
  const proYearly = getEnvOrNull('STRIPE_PRICE_PRO_YEARLY');
  const enterpriseMonthly = getEnvOrNull('STRIPE_PRICE_ENTERPRISE_MONTHLY');
  const enterpriseYearly = getEnvOrNull('STRIPE_PRICE_ENTERPRISE_YEARLY');

  // Return null if essential prices are missing
  if (!starterMonthly || !starterYearly || !proMonthly || !proYearly) {
    return null;
  }

  return {
    STARTER_MONTHLY: starterMonthly,
    STARTER_YEARLY: starterYearly,
    PRO_MONTHLY: proMonthly,
    PRO_YEARLY: proYearly,
    ENTERPRISE_MONTHLY: enterpriseMonthly || '',
    ENTERPRISE_YEARLY: enterpriseYearly || '',
  };
}

function getPriceId(tierId: string, billingPeriod: 'monthly' | 'yearly'): string {
  const priceIds = getPriceIds();
  if (!priceIds) {
    throw new Error('Stripe price IDs not configured');
  }

  const key = `${tierId.toUpperCase()}_${billingPeriod.toUpperCase()}` as keyof StripePriceIds;
  const priceId = priceIds[key];

  if (!priceId) {
    throw new Error(`No Stripe price ID configured for tier ${tierId} (${billingPeriod})`);
  }

  return priceId;
}

// ============================================================================
// Stripe Client Singleton
// ============================================================================

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!stripeClient) {
    const secretKey = getEnvOrNull('STRIPE_SECRET_KEY');
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY not configured');
    }

    stripeClient = new Stripe(secretKey);
  }

  return stripeClient;
}

// ============================================================================
// Helper Functions
// ============================================================================

function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  const statusMap: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
    active: 'active',
    past_due: 'past_due',
    canceled: 'cancelled',
    paused: 'paused',
    trialing: 'trialing',
    incomplete: 'incomplete',
    incomplete_expired: 'incomplete_expired',
    unpaid: 'past_due',
  };

  return statusMap[status] || 'active';
}

function mapStripeEventType(type: string): WebhookEventType | null {
  const eventMap: Record<string, WebhookEventType> = {
    'checkout.session.completed': 'checkout.completed',
    'customer.subscription.created': 'subscription.created',
    'customer.subscription.updated': 'subscription.updated',
    'customer.subscription.deleted': 'subscription.cancelled',
    'customer.subscription.paused': 'subscription.paused',
    'customer.subscription.resumed': 'subscription.resumed',
    'invoice.paid': 'payment.succeeded',
    'invoice.payment_failed': 'payment.failed',
    'customer.created': 'customer.created',
    'customer.updated': 'customer.updated',
  };

  return eventMap[type] || null;
}

function extractAccountIdFromMetadata(metadata?: Stripe.Metadata | null): string | undefined {
  return metadata?.accountId || metadata?.account_id;
}

// ============================================================================
// Stripe Gateway Implementation
// ============================================================================

export const stripeGateway: PaymentGateway = {
  id: 'stripe',
  name: 'Stripe',
  icon: 'stripe',

  isConfigured(): boolean {
    const secretKey = getEnvOrNull('STRIPE_SECRET_KEY');
    const priceIds = getPriceIds();
    return Boolean(secretKey && priceIds);
  },

  async createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult> {
    const stripe = getStripeClient();
    const priceId = getPriceId(params.tierId, params.billingPeriod);

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: {
        accountId: params.accountId,
        tierId: params.tierId,
        billingPeriod: params.billingPeriod,
        ...params.metadata,
      },
      subscription_data: {
        metadata: {
          accountId: params.accountId,
          tierId: params.tierId,
          billingPeriod: params.billingPeriod,
        },
      },
    };

    // Add customer if provided
    if (params.customerId) {
      sessionParams.customer = params.customerId;
    } else if (params.customerEmail) {
      sessionParams.customer_email = params.customerEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    if (!session.url) {
      throw new Error('Failed to create checkout session URL');
    }

    return {
      checkoutUrl: session.url,
      sessionId: session.id,
    };
  },

  async createSubscription(params: SubscriptionParams): Promise<SubscriptionResult> {
    const stripe = getStripeClient();
    const priceId = getPriceId(params.tierId, params.billingPeriod);

    const subscriptionParams: Stripe.SubscriptionCreateParams = {
      customer: params.customerId,
      items: [{ price: priceId }],
      metadata: {
        accountId: params.accountId,
        tierId: params.tierId,
        billingPeriod: params.billingPeriod,
      },
    };

    if (params.paymentMethodId) {
      subscriptionParams.default_payment_method = params.paymentMethodId;
    }

    const subscription = await stripe.subscriptions.create(subscriptionParams);

    return {
      subscriptionId: subscription.id,
      status: mapStripeStatus(subscription.status),
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    };
  },

  async updateSubscription(
    subscriptionId: string,
    params: UpdateSubscriptionParams
  ): Promise<SubscriptionResult> {
    const stripe = getStripeClient();
    const updateParams: Stripe.SubscriptionUpdateParams = {};

    // Handle cancel at period end
    if (params.cancelAtPeriodEnd !== undefined) {
      updateParams.cancel_at_period_end = params.cancelAtPeriodEnd;
    }

    // Handle tier/period change
    if (params.tierId || params.billingPeriod) {
      // Get current subscription to determine what to change
      const currentSub = await stripe.subscriptions.retrieve(subscriptionId);
      const currentItem = currentSub.items.data[0];

      if (!currentItem) {
        throw new Error('Subscription has no items');
      }

      const newTierId = params.tierId || (currentSub.metadata.tierId as string);
      const newBillingPeriod = params.billingPeriod || (currentSub.metadata.billingPeriod as 'monthly' | 'yearly');
      const newPriceId = getPriceId(newTierId, newBillingPeriod);

      updateParams.items = [
        {
          id: currentItem.id,
          price: newPriceId,
        },
      ];

      updateParams.metadata = {
        ...currentSub.metadata,
        tierId: newTierId,
        billingPeriod: newBillingPeriod,
      };

      // Prorate by default
      updateParams.proration_behavior = 'create_prorations';
    }

    const subscription = await stripe.subscriptions.update(subscriptionId, updateParams);

    return {
      subscriptionId: subscription.id,
      status: mapStripeStatus(subscription.status),
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    };
  },

  async cancelSubscription(subscriptionId: string, immediately = false): Promise<void> {
    const stripe = getStripeClient();

    if (immediately) {
      await stripe.subscriptions.cancel(subscriptionId);
    } else {
      await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
    }
  },

  async pauseSubscription(subscriptionId: string): Promise<void> {
    const stripe = getStripeClient();
    await stripe.subscriptions.update(subscriptionId, {
      pause_collection: {
        behavior: 'mark_uncollectible',
      },
    });
  },

  async resumeSubscription(subscriptionId: string): Promise<void> {
    const stripe = getStripeClient();
    await stripe.subscriptions.update(subscriptionId, {
      pause_collection: '',
    });
  },

  async getSubscription(subscriptionId: string): Promise<SubscriptionResult | null> {
    const stripe = getStripeClient();

    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);

      return {
        subscriptionId: subscription.id,
        status: mapStripeStatus(subscription.status),
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      };
    } catch (error) {
      if ((error as Stripe.errors.StripeError).code === 'resource_missing') {
        return null;
      }
      throw error;
    }
  },

  async createCustomer(params: CustomerParams): Promise<string> {
    const stripe = getStripeClient();

    const customer = await stripe.customers.create({
      email: params.email,
      name: params.name,
      metadata: {
        accountId: params.accountId,
        ...params.metadata,
      },
    });

    return customer.id;
  },

  async getCustomerPortalUrl(customerId: string, returnUrl: string): Promise<CustomerPortalResult> {
    const stripe = getStripeClient();

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return {
      url: session.url,
    };
  },

  async getPaymentMethods(customerId: string): Promise<PaymentMethodInfo[]> {
    const stripe = getStripeClient();

    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
    });

    // Get customer's default payment method
    const customer = await stripe.customers.retrieve(customerId);
    const defaultPaymentMethodId =
      typeof customer !== 'string' && !customer.deleted
        ? customer.invoice_settings?.default_payment_method
        : null;

    return paymentMethods.data.map((pm) => ({
      id: pm.id,
      type: 'card' as const,
      last4: pm.card?.last4,
      brand: pm.card?.brand,
      expiryMonth: pm.card?.exp_month,
      expiryYear: pm.card?.exp_year,
      isDefault: pm.id === defaultPaymentMethodId,
    }));
  },

  async handleWebhook(payload: string | Buffer, signature: string): Promise<WebhookEvent> {
    const stripe = getStripeClient();
    const webhookSecret = getEnvOrThrow('STRIPE_WEBHOOK_SECRET');

    // Verify and construct the event
    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret
    );

    // Map Stripe event to our event type
    const eventType = mapStripeEventType(event.type);

    if (!eventType) {
      // Return a generic event for unsupported types
      return {
        id: `stripe_${event.id}`,
        type: 'subscription.updated' as WebhookEventType,
        gatewayId: 'stripe',
        gatewayEventId: event.id,
        data: {
          originalType: event.type,
        },
        createdAt: new Date(event.created * 1000),
      };
    }

    // Extract data based on event type
    const eventData = event.data.object as unknown as Record<string, unknown>;
    let accountId: string | undefined;
    let subscriptionId: string | undefined;
    let customerId: string | undefined;
    let paymentId: string | undefined;
    let amount: number | undefined;
    let currency: string | undefined;
    let tierId: string | undefined;
    let status: string | undefined;
    let metadata: Record<string, string> | undefined;

    // Handle checkout.session.completed
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      accountId = extractAccountIdFromMetadata(session.metadata);
      subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
      customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
      tierId = session.metadata?.tierId;
      metadata = session.metadata as Record<string, string>;
    }

    // Handle subscription events
    if (event.type.startsWith('customer.subscription')) {
      const subscription = event.data.object as Stripe.Subscription;
      accountId = extractAccountIdFromMetadata(subscription.metadata);
      subscriptionId = subscription.id;
      customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
      status = subscription.status;
      tierId = subscription.metadata?.tierId;
      metadata = subscription.metadata as Record<string, string>;
    }

    // Handle invoice events
    if (event.type.startsWith('invoice.')) {
      const invoice = event.data.object as Stripe.Invoice;
      accountId = extractAccountIdFromMetadata(invoice.subscription_details?.metadata);
      subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
      customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
      paymentId = invoice.payment_intent as string;
      amount = invoice.amount_paid;
      currency = invoice.currency;
    }

    // Handle customer events
    if (event.type.startsWith('customer.') && !event.type.startsWith('customer.subscription')) {
      const customer = event.data.object as Stripe.Customer;
      accountId = extractAccountIdFromMetadata(customer.metadata);
      customerId = customer.id;
    }

    return {
      id: `stripe_${event.id}`,
      type: eventType,
      gatewayId: 'stripe',
      gatewayEventId: event.id,
      accountId,
      data: {
        subscriptionId,
        customerId,
        paymentId,
        amount,
        currency,
        tierId,
        status,
        metadata,
      },
      createdAt: new Date(event.created * 1000),
    };
  },
};

// Export helper for getting publishable key (for frontend)
export function getStripePublishableKey(): string {
  return getEnvOrThrow('STRIPE_PUBLISHABLE_KEY');
}
