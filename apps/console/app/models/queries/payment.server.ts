import { prisma } from "@secretlobby/db";

export async function getRecentPayments(accountId: string, take = 3) {
  return prisma.paymentHistory.findMany({
    where: { accountId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function getPaymentsWithPagination(
  accountId: string,
  page: number,
  pageSize = 20
) {
  const [payments, total] = await Promise.all([
    prisma.paymentHistory.findMany({
      where: { accountId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.paymentHistory.count({ where: { accountId } }),
  ]);

  return { payments, total };
}
