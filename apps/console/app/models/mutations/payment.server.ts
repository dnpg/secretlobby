/**
 * PaymentHistory direct-write helpers.
 *
 * The Stripe webhook handler (`@secretlobby/payments/billing`) inserts
 * these rows automatically — feature code generally should NOT call
 * `createPaymentHistory` directly. The helpers are kept for
 * imperative testing/scripting only.
 *
 * Schema reminder: canonical columns are `gatewayId` + `gatewayPaymentId`.
 */

import { prisma, type PaymentStatus } from "@secretlobby/db";

export interface CreatePaymentHistoryInput {
  accountId: string;
  subscriptionId?: string | null;
  gatewayId: string;
  gatewayPaymentId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  description?: string | null;
  invoiceUrl?: string | null;
  receiptUrl?: string | null;
}

export async function createPaymentHistory(input: CreatePaymentHistoryInput) {
  return prisma.paymentHistory.create({
    data: {
      accountId: input.accountId,
      subscriptionId: input.subscriptionId ?? undefined,
      gatewayId: input.gatewayId,
      gatewayPaymentId: input.gatewayPaymentId,
      amount: input.amount,
      currency: input.currency,
      status: input.status,
      description: input.description ?? undefined,
      invoiceUrl: input.invoiceUrl ?? undefined,
      receiptUrl: input.receiptUrl ?? undefined,
    },
  });
}

/** Update the status on every PaymentHistory row that points at the
 * same gateway payment id. Used for late refund/chargeback updates. */
export async function updatePaymentHistoryStatus(
  gatewayPaymentId: string,
  status: PaymentStatus
) {
  return prisma.paymentHistory.updateMany({
    where: { gatewayPaymentId },
    data: { status },
  });
}
