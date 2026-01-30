/**
 * Stripe Webhook Handler
 *
 * This endpoint receives webhook events from Stripe and processes them
 * to update subscriptions and payment records in the database.
 *
 * IMPORTANT: This endpoint must be excluded from CSRF protection
 * as it receives POST requests from Stripe's servers.
 */

import { data } from "react-router";
import type { Route } from "./+types/api.webhooks.stripe";

export async function action({ request }: Route.ActionArgs) {
  // Server-only imports
  const { paymentManager, processWebhookEvent, registerConfiguredGateways } = await import("@secretlobby/payments");

  // Register gateways
  registerConfiguredGateways();
  // Only accept POST requests
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    // Get the raw body as text for signature verification
    const payload = await request.text();

    // Get Stripe signature header
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      console.error("Webhook error: Missing stripe-signature header");
      return data({ error: "Missing signature" }, { status: 400 });
    }

    // Verify and parse the webhook event
    let event;
    try {
      event = await paymentManager.handleWebhook("stripe", payload, signature);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`Webhook signature verification failed: ${message}`);
      return data({ error: `Webhook Error: ${message}` }, { status: 400 });
    }

    console.log(`Received Stripe webhook: ${event.type} (${event.gatewayEventId})`);

    // Process the event
    const result = await processWebhookEvent(event);

    if (!result.success) {
      console.error(`Webhook processing failed: ${result.message}`);
      // Return 500 to allow Stripe to retry the webhook
      return data(
        { error: result.message, received: true },
        { status: 500 }
      );
    }

    console.log(`Webhook processed: ${result.message}`);

    return data({ received: true, message: result.message }, { status: 200 });
  } catch (error) {
    console.error("Webhook handler error:", error);
    return data(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

// Loader returns 405 for GET requests
export async function loader() {
  return data({ error: "Method not allowed" }, { status: 405 });
}
