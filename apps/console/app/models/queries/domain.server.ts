import { prisma } from "@secretlobby/db";

export async function getDomainByDomain(domain: string) {
  return prisma.domain.findUnique({
    where: { domain: domain.toLowerCase() },
  });
}

export async function getDomainsByAccountId(accountId: string) {
  return prisma.domain.findMany({
    where: { accountId },
    orderBy: { createdAt: "desc" },
  });
}
