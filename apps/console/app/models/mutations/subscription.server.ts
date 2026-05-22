/**
 * Direct Subscription DB mutations used by the console UI.
 *
 * For most billing operations you should NOT use this file directly —
 * use `@secretlobby/payments/billing` instead. These helpers exist for
 * the narrow cases where the console needs to flip a single field
 * (e.g. local mirror of a Stripe cancellation request) without going
 * through the full webhook pipeline.
 *
 * Schema reminder: the canonical Subscription columns are
 * `gatewayId` + `gatewaySubscriptionId` (NOT `stripeSubscriptionId`).
 * The earlier scaffolding referenced non-existent fields; that's been
 * corrected here.
 */

import { prisma, type SubscriptionStatus } from "@secretlobby/db";

export interface UpdateSubscriptionPatch {
  status?: SubscriptionStatus;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
  billingPeriod?: string;
}

/** Patch a Subscription row by its internal id. */
export async function updateSubscription(
  id: string,
  patch: UpdateSubscriptionPatch
) {
  return prisma.subscription.update({
    where: { id },
    data: patch,
  });
}

/**
 * Patch by the Stripe-side subscription id. Looks up via the composite
 * unique key (gatewayId='stripe', gatewaySubscriptionId).
 *
 * Returns null if no row matched. We don't throw because the caller
 * typically wants "if it exists, update it; otherwise the webhook
 * will create it next."
 */
export async function updateSubscriptionByStripeId(
  stripeSubscriptionId: string,
  patch: UpdateSubscriptionPatch
) {
  const existing = await prisma.subscription.findUnique({
    where: {
      gatewayId_gatewaySubscriptionId: {
        gatewayId: "stripe",
        gatewaySubscriptionId: stripeSubscriptionId,
      },
    },
    select: { id: true },
  });
  if (!existing) return null;
  return prisma.subscription.update({
    where: { id: existing.id },
    data: patch,
  });
}
