import { prisma, SubscriptionTier } from "@secretlobby/db";

// Default plan limits by tier (fallback if no SubscriptionPlan record exists)
const DEFAULT_PLAN_LIMITS: Record<SubscriptionTier, { maxLobbies: number; maxSongs: number; maxStorage: number }> = {
  FREE: { maxLobbies: 1, maxSongs: 5, maxStorage: 100 },
  STARTER: { maxLobbies: 3, maxSongs: 25, maxStorage: 500 },
  PRO: { maxLobbies: 10, maxSongs: 100, maxStorage: 2000 },
  ENTERPRISE: { maxLobbies: -1, maxSongs: -1, maxStorage: -1 }, // -1 = unlimited
};

export interface PlanLimits {
  maxLobbies: number;
  maxSongs: number;
  maxStorage: number;
  customDomain: boolean;
}

export async function getAccountPlanLimits(accountId: string): Promise<PlanLimits> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { subscriptionTier: true },
  });

  const tier = account?.subscriptionTier || "FREE";

  // Try to get from SubscriptionPlan table
  const plan = await prisma.subscriptionPlan.findUnique({
    where: { slug: tier },
    select: {
      maxLobbies: true,
      maxSongs: true,
      maxStorage: true,
      customDomain: true,
    },
  });

  if (plan) {
    return {
      maxLobbies: plan.maxLobbies,
      maxSongs: plan.maxSongs,
      maxStorage: plan.maxStorage,
      customDomain: plan.customDomain,
    };
  }

  // Fallback to defaults
  const defaults = DEFAULT_PLAN_LIMITS[tier];
  return {
    maxLobbies: defaults.maxLobbies,
    maxSongs: defaults.maxSongs,
    maxStorage: defaults.maxStorage,
    customDomain: tier !== "FREE",
  };
}

export async function canCreateMoreLobbies(accountId: string): Promise<{ allowed: boolean; current: number; max: number }> {
  const [limits, count] = await Promise.all([
    getAccountPlanLimits(accountId),
    prisma.lobby.count({ where: { accountId } }),
  ]);

  // -1 means unlimited
  const allowed = limits.maxLobbies === -1 || count < limits.maxLobbies;

  return {
    allowed,
    current: count,
    max: limits.maxLobbies,
  };
}

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
