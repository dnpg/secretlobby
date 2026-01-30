/**
 * PayPal Payment Gateway Adapter (Stub)
 *
 * This is a stub implementation for future PayPal integration.
 * It implements the PaymentGateway interface but throws errors for all operations.
 */

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
} from '../types.js';

// ============================================================================
// Environment Variables
// ============================================================================

function getEnvOrNull(name: string): string | null {
  return process.env[name] || null;
}

// ============================================================================
// PayPal Gateway Implementation (Stub)
// ============================================================================

export const paypalGateway: PaymentGateway = {
  id: 'paypal',
  name: 'PayPal',
  icon: 'paypal',

  isConfigured(): boolean {
    // Check if PayPal credentials are configured
    const clientId = getEnvOrNull('PAYPAL_CLIENT_ID');
    const clientSecret = getEnvOrNull('PAYPAL_CLIENT_SECRET');
    return Boolean(clientId && clientSecret);
  },

  async createCheckoutSession(_params: CheckoutParams): Promise<CheckoutResult> {
    throw new Error('PayPal integration not yet implemented');
  },

  async createSubscription(_params: SubscriptionParams): Promise<SubscriptionResult> {
    throw new Error('PayPal integration not yet implemented');
  },

  async updateSubscription(
    _subscriptionId: string,
    _params: UpdateSubscriptionParams
  ): Promise<SubscriptionResult> {
    throw new Error('PayPal integration not yet implemented');
  },

  async cancelSubscription(_subscriptionId: string, _immediately?: boolean): Promise<void> {
    throw new Error('PayPal integration not yet implemented');
  },

  async pauseSubscription(_subscriptionId: string): Promise<void> {
    throw new Error('PayPal integration not yet implemented');
  },

  async resumeSubscription(_subscriptionId: string): Promise<void> {
    throw new Error('PayPal integration not yet implemented');
  },

  async getSubscription(_subscriptionId: string): Promise<SubscriptionResult | null> {
    throw new Error('PayPal integration not yet implemented');
  },

  async createCustomer(_params: CustomerParams): Promise<string> {
    throw new Error('PayPal integration not yet implemented');
  },

  async getCustomerPortalUrl(
    _customerId: string,
    _returnUrl: string
  ): Promise<CustomerPortalResult> {
    throw new Error('PayPal integration not yet implemented');
  },

  async getPaymentMethods(_customerId: string): Promise<PaymentMethodInfo[]> {
    throw new Error('PayPal integration not yet implemented');
  },

  async handleWebhook(_payload: string | Buffer, _signature: string): Promise<WebhookEvent> {
    throw new Error('PayPal integration not yet implemented');
  },
};
