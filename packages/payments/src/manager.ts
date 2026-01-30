/**
 * Payment Gateway Manager
 *
 * Central manager for registering and accessing payment gateways.
 * Provides a unified interface for working with multiple payment providers.
 */

import type {
  PaymentGateway,
  AvailableGateway,
  CheckoutParams,
  CheckoutResult,
  SubscriptionParams,
  SubscriptionResult,
  UpdateSubscriptionParams,
  CustomerParams,
  CustomerPortalResult,
  PaymentMethodInfo,
  WebhookEvent,
} from './types.js';

class PaymentGatewayManager {
  private gateways: Map<string, PaymentGateway> = new Map();
  private defaultGatewayId: string | null = null;

  /**
   * Register a payment gateway
   */
  registerGateway(gateway: PaymentGateway, isDefault = false): void {
    this.gateways.set(gateway.id, gateway);

    if (isDefault || this.gateways.size === 1) {
      this.defaultGatewayId = gateway.id;
    }
  }

  /**
   * Unregister a payment gateway
   */
  unregisterGateway(gatewayId: string): void {
    this.gateways.delete(gatewayId);

    if (this.defaultGatewayId === gatewayId) {
      // Set a new default if available
      const firstGateway = this.gateways.keys().next().value;
      this.defaultGatewayId = firstGateway || null;
    }
  }

  /**
   * Set the default gateway
   */
  setDefaultGateway(gatewayId: string): void {
    if (!this.gateways.has(gatewayId)) {
      throw new Error(`Gateway '${gatewayId}' is not registered`);
    }
    this.defaultGatewayId = gatewayId;
  }

  /**
   * Get a specific gateway by ID
   */
  getGateway(gatewayId: string): PaymentGateway {
    const gateway = this.gateways.get(gatewayId);
    if (!gateway) {
      throw new Error(`Gateway '${gatewayId}' is not registered`);
    }
    return gateway;
  }

  /**
   * Get the default gateway
   */
  getDefaultGateway(): PaymentGateway {
    if (!this.defaultGatewayId) {
      throw new Error('No payment gateway configured');
    }
    return this.getGateway(this.defaultGatewayId);
  }

  /**
   * Get all available (configured) gateways
   */
  getAvailableGateways(): AvailableGateway[] {
    const available: AvailableGateway[] = [];

    for (const [id, gateway] of this.gateways) {
      if (gateway.isConfigured()) {
        available.push({
          id,
          name: gateway.name,
          icon: gateway.icon,
          isConfigured: true,
          isDefault: id === this.defaultGatewayId,
        });
      }
    }

    return available;
  }

  /**
   * Get all registered gateways (including unconfigured)
   */
  getAllGateways(): AvailableGateway[] {
    const all: AvailableGateway[] = [];

    for (const [id, gateway] of this.gateways) {
      all.push({
        id,
        name: gateway.name,
        icon: gateway.icon,
        isConfigured: gateway.isConfigured(),
        isDefault: id === this.defaultGatewayId,
      });
    }

    return all;
  }

  /**
   * Check if any gateway is configured
   */
  hasConfiguredGateway(): boolean {
    for (const gateway of this.gateways.values()) {
      if (gateway.isConfigured()) {
        return true;
      }
    }
    return false;
  }

  // =========================================================================
  // Convenience methods that use the default gateway
  // =========================================================================

  /**
   * Create a checkout session using the default or specified gateway
   */
  async createCheckoutSession(
    params: CheckoutParams,
    gatewayId?: string
  ): Promise<CheckoutResult & { gatewayId: string }> {
    const gateway = gatewayId ? this.getGateway(gatewayId) : this.getDefaultGateway();

    if (!gateway.isConfigured()) {
      throw new Error(`Gateway '${gateway.id}' is not properly configured`);
    }

    const result = await gateway.createCheckoutSession(params);
    return { ...result, gatewayId: gateway.id };
  }

  /**
   * Create a subscription using the default or specified gateway
   */
  async createSubscription(
    params: SubscriptionParams,
    gatewayId?: string
  ): Promise<SubscriptionResult & { gatewayId: string }> {
    const gateway = gatewayId ? this.getGateway(gatewayId) : this.getDefaultGateway();

    if (!gateway.isConfigured()) {
      throw new Error(`Gateway '${gateway.id}' is not properly configured`);
    }

    const result = await gateway.createSubscription(params);
    return { ...result, gatewayId: gateway.id };
  }

  /**
   * Update a subscription
   */
  async updateSubscription(
    gatewayId: string,
    subscriptionId: string,
    params: UpdateSubscriptionParams
  ): Promise<SubscriptionResult> {
    const gateway = this.getGateway(gatewayId);
    return gateway.updateSubscription(subscriptionId, params);
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(
    gatewayId: string,
    subscriptionId: string,
    immediately = false
  ): Promise<void> {
    const gateway = this.getGateway(gatewayId);
    return gateway.cancelSubscription(subscriptionId, immediately);
  }

  /**
   * Get subscription details
   */
  async getSubscription(
    gatewayId: string,
    subscriptionId: string
  ): Promise<SubscriptionResult | null> {
    const gateway = this.getGateway(gatewayId);
    return gateway.getSubscription(subscriptionId);
  }

  /**
   * Create a customer using the default or specified gateway
   */
  async createCustomer(
    params: CustomerParams,
    gatewayId?: string
  ): Promise<{ customerId: string; gatewayId: string }> {
    const gateway = gatewayId ? this.getGateway(gatewayId) : this.getDefaultGateway();

    if (!gateway.isConfigured()) {
      throw new Error(`Gateway '${gateway.id}' is not properly configured`);
    }

    const customerId = await gateway.createCustomer(params);
    return { customerId, gatewayId: gateway.id };
  }

  /**
   * Get customer portal URL
   */
  async getCustomerPortalUrl(
    gatewayId: string,
    customerId: string,
    returnUrl: string
  ): Promise<CustomerPortalResult> {
    const gateway = this.getGateway(gatewayId);
    return gateway.getCustomerPortalUrl(customerId, returnUrl);
  }

  /**
   * Get customer's payment methods
   */
  async getPaymentMethods(gatewayId: string, customerId: string): Promise<PaymentMethodInfo[]> {
    const gateway = this.getGateway(gatewayId);
    return gateway.getPaymentMethods(customerId);
  }

  /**
   * Handle a webhook from a specific gateway
   */
  async handleWebhook(
    gatewayId: string,
    payload: string | Buffer,
    signature: string
  ): Promise<WebhookEvent> {
    const gateway = this.getGateway(gatewayId);
    return gateway.handleWebhook(payload, signature);
  }
}

// Singleton instance
export const paymentManager = new PaymentGatewayManager();

// Export the class for testing purposes
export { PaymentGatewayManager };
