import { prisma } from "@secretlobby/db";

export async function createDomain(accountId: string, domain: string) {
  return prisma.domain.create({
    data: {
      accountId,
      domain: domain.toLowerCase(),
      status: "PENDING",
    },
  });
}

export async function deleteDomain(domainId: string, accountId: string) {
  return prisma.domain.delete({
    where: {
      id: domainId,
      accountId, // Ensure user owns this domain
    },
  });
}

export async function updateDomainStatus(domainId: string, status: string) {
  return prisma.domain.update({
    where: { id: domainId },
    data: { status },
  });
}
