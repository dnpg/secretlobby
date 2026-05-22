import { prisma } from "@secretlobby/db";

// =============================================================================
// Swatch queries
// -----------------------------------------------------------------------------
// Per-account saved colors + gradients used by the ColorPicker library tab.
// =============================================================================

export async function listSwatchesByAccount(accountId: string) {
  return prisma.swatch.findMany({
    where: { accountId },
    orderBy: { createdAt: "desc" },
  });
}
