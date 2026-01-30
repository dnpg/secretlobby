import { prisma } from "@secretlobby/db";

export async function createSubscription(data: {
  accountId: string;
  gateway: string;
  gatewayId: string;
  stripeSubscriptionId?: string;
  tierId: string;
  status: string;
  billingPeriod: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}) {
  return prisma.subscription.create({
    data: {
      accountId: data.accountId,
      gateway: data.gateway,
      gatewayId: data.gatewayId,
      stripeSubscriptionId: data.stripeSubscriptionId,
      tierId: data.tierId,
      status: data.status,
      billingPeriod: data.billingPeriod,
      currentPeriodStart: data.currentPeriodStart,
      currentPeriodEnd: data.currentPeriodEnd,
    },
  });
}

export async function updateSubscription(
  id: string,
  data: {
    status?: string;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
    cancelAtPeriodEnd?: boolean;
    tierId?: string;
  }
) {
  return prisma.subscription.update({
    where: { id },
    data,
  });
}

export async function updateSubscriptionByStripeId(
  stripeSubscriptionId: string,
  data: {
    status?: string;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
    cancelAtPeriodEnd?: boolean;
    tierId?: string;
  }
) {
  return prisma.subscription.update({
    where: { stripeSubscriptionId },
    data,
  });
}
