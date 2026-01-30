import { prisma } from "@secretlobby/db";

export async function createPaymentHistory(data: {
  accountId: string;
  subscriptionId?: string;
  gateway: string;
  gatewayId: string;
  amount: number;
  currency: string;
  status: string;
  description?: string | null;
  invoiceUrl?: string | null;
  receiptUrl?: string | null;
}) {
  return prisma.paymentHistory.create({
    data: {
      accountId: data.accountId,
      subscriptionId: data.subscriptionId,
      gateway: data.gateway,
      gatewayId: data.gatewayId,
      amount: data.amount,
      currency: data.currency,
      status: data.status,
      description: data.description,
      invoiceUrl: data.invoiceUrl,
      receiptUrl: data.receiptUrl,
    },
  });
}

export async function updatePaymentHistoryStatus(gatewayId: string, status: string) {
  return prisma.paymentHistory.updateMany({
    where: { gatewayId },
    data: { status },
  });
}
