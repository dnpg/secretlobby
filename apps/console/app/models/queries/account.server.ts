import { prisma } from "@secretlobby/db";

export async function getAccountById(accountId: string) {
  return prisma.account.findUnique({
    where: { id: accountId },
  });
}

export async function getAccountWithBasicInfo(accountId: string) {
  return prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      slug: true,
    },
  });
}

export async function getAccountWithBillingInfo(accountId: string) {
  return prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      subscriptionTier: true,
      stripeCustomerId: true,
    },
  });
}

export async function getAccountWithDomains(accountId: string) {
  return prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      slug: true,
      subscriptionTier: true,
      createdAt: true,
      updatedAt: true,
      domains: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          domain: true,
          status: true,
          accountId: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      lobbies: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          slug: true,
          isDefault: true,
        },
      },
    },
  });
}

export async function getAccountBySlug(slug: string) {
  return prisma.account.findUnique({
    where: { slug },
  });
}

export async function getAccountSettings(accountId: string) {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { settings: true },
  });
  if (!account?.settings || typeof account.settings !== "object") {
    return {};
  }
  return account.settings as Record<string, unknown>;
}

export async function getFirstAccountSettings() {
  return prisma.account.findFirst({
    select: { settings: true },
  });
}

export async function getAccountWithOwner(accountId: string) {
  return prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      slug: true,
      subscriptionTier: true,
      createdAt: true,
      updatedAt: true,
      users: {
        where: { role: "OWNER" },
        take: 1,
        select: {
          role: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      },
    },
  });
}

export async function getAccountStripeCustomerId(accountId: string) {
  return prisma.account.findUnique({
    where: { id: accountId },
    select: { stripeCustomerId: true },
  });
}
