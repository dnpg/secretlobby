import { prisma } from "@secretlobby/db";

export async function updateAccountSlug(accountId: string, slug: string) {
  return prisma.account.update({
    where: { id: accountId },
    data: { slug },
  });
}

export async function updateAccountSettings(accountId: string, settings: Record<string, unknown>) {
  return prisma.account.update({
    where: { id: accountId },
    data: { settings: JSON.parse(JSON.stringify(settings)) },
  });
}

export async function updateAccountSubscription(
  accountId: string,
  data: {
    subscriptionTier?: string;
    stripeCustomerId?: string | null;
  }
) {
  return prisma.account.update({
    where: { id: accountId },
    data,
  });
}

export async function createAccount(data: {
  name: string;
  slug: string;
  subscriptionTier?: string;
}) {
  return prisma.account.create({
    data: {
      name: data.name,
      slug: data.slug,
      subscriptionTier: data.subscriptionTier || "FREE",
    },
  });
}

export async function updateAccountDefaultLobby(accountId: string, defaultLobbyId: string) {
  return prisma.account.update({
    where: { id: accountId },
    data: { defaultLobbyId },
  });
}
