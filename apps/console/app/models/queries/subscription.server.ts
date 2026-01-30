import { prisma } from "@secretlobby/db";

export async function getActiveSubscription(accountId: string) {
  return prisma.subscription.findFirst({
    where: {
      accountId,
      status: { in: ["ACTIVE", "TRIALING"] },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getActiveOrPastDueSubscription(accountId: string) {
  return prisma.subscription.findFirst({
    where: {
      accountId,
      status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getSubscriptionByStripeId(stripeSubscriptionId: string) {
  return prisma.subscription.findUnique({
    where: { stripeSubscriptionId },
  });
}

export async function getCancellableSubscription(accountId: string) {
  return prisma.subscription.findFirst({
    where: {
      accountId,
      cancelAtPeriodEnd: true,
    },
  });
}

export async function getSubscriptionByGatewaySubscriptionId(gatewaySubscriptionId: string) {
  return prisma.subscription.findFirst({
    where: { gatewaySubscriptionId },
  });
}
