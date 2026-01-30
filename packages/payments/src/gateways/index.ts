/**
 * Payment Gateways Registry
 *
 * This module exports all available payment gateways and provides
 * a function to register them with the payment manager.
 */

import { paymentManager } from '../manager.js';
import { stripeGateway } from './stripe.js';
import { paypalGateway } from './paypal.js';

export { stripeGateway } from './stripe.js';
export { paypalGateway } from './paypal.js';

/**
 * Register all available gateways with the payment manager.
 * Call this once during application startup.
 */
export function registerAllGateways(): void {
  // Register Stripe as the default gateway
  paymentManager.registerGateway(stripeGateway, true);

  // Register PayPal (will only be available if configured)
  paymentManager.registerGateway(paypalGateway);
}

/**
 * Register only configured gateways.
 * This is useful for production environments where you only want
 * to expose properly configured gateways.
 */
export function registerConfiguredGateways(): void {
  if (stripeGateway.isConfigured()) {
    paymentManager.registerGateway(stripeGateway, true);
  }

  if (paypalGateway.isConfigured()) {
    paymentManager.registerGateway(paypalGateway, !stripeGateway.isConfigured());
  }
}
