---
sidebar_position: 4
slug: /packages/payments
---

# Payments

The payments package provides Stripe integration for subscription and payment processing.

## Overview

- **Package**: `@secretlobby/payments`
- **Technologies**: Stripe SDK

## Features

- Subscription management
- Payment processing
- Webhook handling
- Customer management

## Usage

### Initialize Stripe

```typescript
import { stripe } from '@secretlobby/payments';

// The Stripe client is pre-configured
const customer = await stripe.customers.create({
  email: 'user@example.com',
});
```

### Create Checkout Session

```typescript
import { createCheckoutSession } from '@secretlobby/payments';

const session = await createCheckoutSession({
  customerId: customer.id,
  priceId: 'price_xxx',
  successUrl: 'https://app.secretlobby.co/billing/success',
  cancelUrl: 'https://app.secretlobby.co/billing/cancel',
});

// Redirect user to session.url
```

### Manage Subscriptions

```typescript
import {
  createSubscription,
  cancelSubscription,
  updateSubscription
} from '@secretlobby/payments';

// Create subscription
const subscription = await createSubscription({
  customerId: customer.id,
  priceId: 'price_xxx',
});

// Cancel subscription
await cancelSubscription(subscription.id);

// Update subscription
await updateSubscription(subscription.id, {
  priceId: 'price_new',
});
```

### Webhook Handling

Handle Stripe webhooks in your app:

```typescript
import { handleWebhook, WebhookEvent } from '@secretlobby/payments';

export async function action({ request }: ActionFunctionArgs) {
  const event = await handleWebhook(request);

  switch (event.type) {
    case 'customer.subscription.created':
      // Handle new subscription
      break;
    case 'customer.subscription.deleted':
      // Handle cancellation
      break;
    case 'invoice.paid':
      // Handle successful payment
      break;
    case 'invoice.payment_failed':
      // Handle failed payment
      break;
  }

  return { received: true };
}
```

## Configuration

Configure Stripe via environment variables:

```bash
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_...
```

## Testing

Use Stripe test mode keys for development:

```bash
# Test keys start with sk_test_ and pk_test_
STRIPE_SECRET_KEY=sk_test_...
```

Use Stripe CLI for local webhook testing:

```bash
stripe listen --forward-to localhost:3001/api/webhooks/stripe
```
