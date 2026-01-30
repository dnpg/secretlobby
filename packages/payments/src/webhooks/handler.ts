/**
 * Unified Webhook Handler
 *
 * Processes normalized webhook events from any payment gateway
 * and updates the database accordingly.
 */

import { prisma as db } from '@secretlobby/db/client';
import type { WebhookEvent, SubscriptionStatus } from '../types.js';

// ============================================================================
// Types
// ============================================================================

export interface WebhookHandlerResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

// ============================================================================
// Status Mapping
// ============================================================================

function mapToDbSubscriptionStatus(
  status: SubscriptionStatus
): 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'PAUSED' | 'TRIALING' {
  const statusMap: Record<SubscriptionStatus, 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'PAUSED' | 'TRIALING'> = {
    active: 'ACTIVE',
    past_due: 'PAST_DUE',
    cancelled: 'CANCELLED',
    paused: 'PAUSED',
    trialing: 'TRIALING',
    incomplete: 'ACTIVE', // Treat as active, will be updated when completed
    incomplete_expired: 'CANCELLED',
  };

  return statusMap[status] || 'ACTIVE';
}

function mapToDbSubscriptionTier(
  tierId: string | undefined
): 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE' {
  if (!tierId) return 'FREE';

  const tierMap: Record<string, 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE'> = {
    FREE: 'FREE',
    STARTER: 'STARTER',
    PRO: 'PRO',
    ENTERPRISE: 'ENTERPRISE',
  };

  return tierMap[tierId.toUpperCase()] || 'FREE';
}

function mapToDbPaymentStatus(
  eventType: string
): 'SUCCEEDED' | 'PENDING' | 'FAILED' | 'REFUNDED' {
  if (eventType === 'payment.succeeded') return 'SUCCEEDED';
  if (eventType === 'payment.failed') return 'FAILED';
  return 'PENDING';
}

// ============================================================================
// Event Handlers
// ============================================================================

async function handleCheckoutCompleted(event: WebhookEvent): Promise<WebhookHandlerResult> {
  const { accountId, data } = event;

  if (!accountId) {
    return { success: false, message: 'Missing accountId in webhook event' };
  }

  if (!data.subscriptionId || !data.customerId) {
    return { success: false, message: 'Missing subscription or customer ID in checkout event' };
  }

  // Create or update subscription record
  const subscription = await db.subscription.upsert({
    where: {
      gatewayId_gatewaySubscriptionId: {
        gatewayId: event.gatewayId,
        gatewaySubscriptionId: data.subscriptionId,
      },
    },
    create: {
      accountId,
      gatewayId: event.gatewayId,
      gatewaySubscriptionId: data.subscriptionId,
      gatewayCustomerId: data.customerId,
      tier: mapToDbSubscriptionTier(data.tierId),
      status: 'ACTIVE',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default to 30 days
    },
    update: {
      status: 'ACTIVE',
      tier: mapToDbSubscriptionTier(data.tierId),
    },
  });

  // Update account's subscription tier and Stripe customer ID
  await db.account.update({
    where: { id: accountId },
    data: {
      subscriptionTier: mapToDbSubscriptionTier(data.tierId),
      stripeCustomerId: data.customerId,
    },
  });

  return {
    success: true,
    message: 'Checkout completed successfully',
    data: { subscriptionId: subscription.id },
  };
}

async function handleSubscriptionCreated(event: WebhookEvent): Promise<WebhookHandlerResult> {
  const { accountId, data } = event;

  if (!accountId || !data.subscriptionId || !data.customerId) {
    return { success: false, message: 'Missing required data in subscription created event' };
  }

  const subscription = await db.subscription.upsert({
    where: {
      gatewayId_gatewaySubscriptionId: {
        gatewayId: event.gatewayId,
        gatewaySubscriptionId: data.subscriptionId,
      },
    },
    create: {
      accountId,
      gatewayId: event.gatewayId,
      gatewaySubscriptionId: data.subscriptionId,
      gatewayCustomerId: data.customerId,
      tier: mapToDbSubscriptionTier(data.tierId),
      status: mapToDbSubscriptionStatus(data.status as SubscriptionStatus || 'active'),
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    update: {
      status: mapToDbSubscriptionStatus(data.status as SubscriptionStatus || 'active'),
      tier: mapToDbSubscriptionTier(data.tierId),
    },
  });

  return {
    success: true,
    message: 'Subscription created',
    data: { subscriptionId: subscription.id },
  };
}

async function handleSubscriptionUpdated(event: WebhookEvent): Promise<WebhookHandlerResult> {
  const { data } = event;

  if (!data.subscriptionId) {
    return { success: false, message: 'Missing subscriptionId in update event' };
  }

  // Find existing subscription
  const existingSubscription = await db.subscription.findFirst({
    where: {
      gatewayId: event.gatewayId,
      gatewaySubscriptionId: data.subscriptionId,
    },
  });

  if (!existingSubscription) {
    return { success: false, message: 'Subscription not found' };
  }

  // Update subscription
  const subscription = await db.subscription.update({
    where: { id: existingSubscription.id },
    data: {
      status: data.status ? mapToDbSubscriptionStatus(data.status as SubscriptionStatus) : undefined,
      tier: data.tierId ? mapToDbSubscriptionTier(data.tierId) : undefined,
    },
  });

  // Update account tier if changed
  if (data.tierId) {
    await db.account.update({
      where: { id: existingSubscription.accountId },
      data: {
        subscriptionTier: mapToDbSubscriptionTier(data.tierId),
      },
    });
  }

  return {
    success: true,
    message: 'Subscription updated',
    data: { subscriptionId: subscription.id },
  };
}

async function handleSubscriptionCancelled(event: WebhookEvent): Promise<WebhookHandlerResult> {
  const { data } = event;

  if (!data.subscriptionId) {
    return { success: false, message: 'Missing subscriptionId in cancellation event' };
  }

  // Find existing subscription
  const existingSubscription = await db.subscription.findFirst({
    where: {
      gatewayId: event.gatewayId,
      gatewaySubscriptionId: data.subscriptionId,
    },
  });

  if (!existingSubscription) {
    return { success: false, message: 'Subscription not found' };
  }

  // Update subscription status
  await db.subscription.update({
    where: { id: existingSubscription.id },
    data: {
      status: 'CANCELLED',
    },
  });

  // Downgrade account to free tier
  await db.account.update({
    where: { id: existingSubscription.accountId },
    data: {
      subscriptionTier: 'FREE',
    },
  });

  return {
    success: true,
    message: 'Subscription cancelled',
    data: { subscriptionId: existingSubscription.id },
  };
}

async function handlePaymentSucceeded(event: WebhookEvent): Promise<WebhookHandlerResult> {
  const { accountId, data } = event;

  // Find account ID from subscription if not provided directly
  let resolvedAccountId = accountId;

  if (!resolvedAccountId && data.subscriptionId) {
    const subscription = await db.subscription.findFirst({
      where: {
        gatewayId: event.gatewayId,
        gatewaySubscriptionId: data.subscriptionId,
      },
    });
    resolvedAccountId = subscription?.accountId;
  }

  if (!resolvedAccountId) {
    return { success: false, message: 'Could not resolve accountId for payment' };
  }

  // Find subscription ID in our database
  let dbSubscriptionId: string | undefined;
  if (data.subscriptionId) {
    const subscription = await db.subscription.findFirst({
      where: {
        gatewayId: event.gatewayId,
        gatewaySubscriptionId: data.subscriptionId,
      },
    });
    dbSubscriptionId = subscription?.id;
  }

  // Record payment in history
  const payment = await db.paymentHistory.create({
    data: {
      accountId: resolvedAccountId,
      subscriptionId: dbSubscriptionId,
      gatewayId: event.gatewayId,
      gatewayPaymentId: data.paymentId || event.gatewayEventId,
      amount: data.amount || 0,
      currency: data.currency || 'usd',
      status: 'SUCCEEDED',
      description: `Subscription payment`,
    },
  });

  return {
    success: true,
    message: 'Payment recorded',
    data: { paymentId: payment.id },
  };
}

async function handlePaymentFailed(event: WebhookEvent): Promise<WebhookHandlerResult> {
  const { accountId, data } = event;

  // Find account ID from subscription if not provided directly
  let resolvedAccountId = accountId;

  if (!resolvedAccountId && data.subscriptionId) {
    const subscription = await db.subscription.findFirst({
      where: {
        gatewayId: event.gatewayId,
        gatewaySubscriptionId: data.subscriptionId,
      },
    });
    resolvedAccountId = subscription?.accountId;
  }

  if (!resolvedAccountId) {
    return { success: false, message: 'Could not resolve accountId for failed payment' };
  }

  // Find subscription ID in our database
  let dbSubscriptionId: string | undefined;
  if (data.subscriptionId) {
    const subscription = await db.subscription.findFirst({
      where: {
        gatewayId: event.gatewayId,
        gatewaySubscriptionId: data.subscriptionId,
      },
    });
    dbSubscriptionId = subscription?.id;

    // Update subscription status to past_due
    if (subscription) {
      await db.subscription.update({
        where: { id: subscription.id },
        data: { status: 'PAST_DUE' },
      });
    }
  }

  // Record failed payment in history
  const payment = await db.paymentHistory.create({
    data: {
      accountId: resolvedAccountId,
      subscriptionId: dbSubscriptionId,
      gatewayId: event.gatewayId,
      gatewayPaymentId: data.paymentId || event.gatewayEventId,
      amount: data.amount || 0,
      currency: data.currency || 'usd',
      status: 'FAILED',
      description: 'Payment failed',
    },
  });

  // TODO: Send email notification about failed payment
  // await sendPaymentFailedEmail(resolvedAccountId);

  return {
    success: true,
    message: 'Failed payment recorded',
    data: { paymentId: payment.id },
  };
}

// ============================================================================
// Main Handler
// ============================================================================

/**
 * Process a webhook event and update the database accordingly.
 */
export async function processWebhookEvent(event: WebhookEvent): Promise<WebhookHandlerResult> {
  console.log(`Processing webhook event: ${event.type} from ${event.gatewayId}`);

  switch (event.type) {
    case 'checkout.completed':
      return handleCheckoutCompleted(event);

    case 'subscription.created':
      return handleSubscriptionCreated(event);

    case 'subscription.updated':
      return handleSubscriptionUpdated(event);

    case 'subscription.cancelled':
      return handleSubscriptionCancelled(event);

    case 'subscription.paused':
      // Similar to update, just change status
      return handleSubscriptionUpdated({
        ...event,
        data: { ...event.data, status: 'paused' },
      });

    case 'subscription.resumed':
      // Similar to update, just change status back to active
      return handleSubscriptionUpdated({
        ...event,
        data: { ...event.data, status: 'active' },
      });

    case 'payment.succeeded':
      return handlePaymentSucceeded(event);

    case 'payment.failed':
      return handlePaymentFailed(event);

    case 'customer.created':
    case 'customer.updated':
      // Customer events are informational, no action needed
      return { success: true, message: 'Customer event processed' };

    default:
      return { success: true, message: `Unhandled event type: ${event.type}` };
  }
}
