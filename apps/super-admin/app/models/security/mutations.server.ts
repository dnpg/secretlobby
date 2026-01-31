import { prisma } from "@secretlobby/db";
import { createLogger } from "@secretlobby/logger/server";

const logger = createLogger({ service: "super-admin:security-mutations" });

/**
 * Clear in-memory rate limits across all lobby apps
 */
async function clearInMemoryRateLimitsRemotely(ipAddress: string) {
  const { clearInMemoryRateLimitsForIP } = await import("@secretlobby/auth/rate-limit");

  // 1. Clear in-memory for super-admin app (this process)
  clearInMemoryRateLimitsForIP(ipAddress);

  // 2. Clear in-memory for all lobby apps by calling their API
  try {
    // Use LOBBY_URL if set, otherwise construct from CORE_DOMAIN or fallback to localhost:3002 (lobby dev port)
    const lobbyUrl = process.env.LOBBY_URL ||
      (process.env.NODE_ENV === "production"
        ? `https://${process.env.CORE_DOMAIN}`
        : `http://localhost:3002`);

    const adminSecret = process.env.ADMIN_API_SECRET || "dev-secret-token";

    logger.info({ ipAddress, lobbyUrl }, "Attempting to clear lobby in-memory rate limits");

    const response = await fetch(`${lobbyUrl}/api/clear-rate-limit/${encodeURIComponent(ipAddress)}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${adminSecret}`,
      },
    });

    if (!response.ok) {
      const responseText = await response.text();
      logger.warn({ ipAddress, status: response.status, responseText }, "Failed to clear lobby in-memory rate limits");
    } else {
      logger.info({ ipAddress }, "Cleared in-memory rate limits in lobby app");
    }
  } catch (error) {
    logger.error({ error, ipAddress }, "Error clearing lobby in-memory rate limits");
  }
}

/**
 * Unblock an IP address
 */
export async function unblockIP(ipAddress: string, adminUserId: string) {
  // 1. Update database violations to RESOLVED status
  await prisma.rateLimitViolation.updateMany({
    where: {
      ipAddress,
      status: { in: ["BLOCKED", "ACTIVE"] },
    },
    data: {
      status: "RESOLVED",
    },
  });

  // 2. Clear in-memory rate limits (super-admin + all lobby apps)
  await clearInMemoryRateLimitsRemotely(ipAddress);

  logger.info({ ipAddress, admin: adminUserId }, "IP unblocked by admin (database + in-memory)");

  return { success: `IP ${ipAddress} unblocked successfully` };
}

/**
 * Clear all violations for an IP address
 */
export async function clearViolations(ipAddress: string, adminUserId: string) {
  // 1. Delete all database violations
  await prisma.rateLimitViolation.deleteMany({
    where: {
      ipAddress,
    },
  });

  // 2. Clear in-memory rate limits (super-admin + all lobby apps)
  await clearInMemoryRateLimitsRemotely(ipAddress);

  logger.info({ ipAddress, admin: adminUserId }, "Violations cleared by admin (database + in-memory)");

  return { success: `Violations for ${ipAddress} cleared successfully` };
}

export interface ManualBlockOptions {
  ipAddress: string;
  endpoint: string;
  scope: "all" | "account";
  accountIds?: string[];
  reason?: string;
  permanent?: boolean;
  adminUserId: string;
}

/**
 * Manually block an IP address
 */
export async function manuallyBlockIP(options: ManualBlockOptions) {
  const {
    ipAddress,
    endpoint,
    scope,
    accountIds = [],
    reason,
    permanent = false,
    adminUserId,
  } = options;

  const violations: any[] = [];

  // Determine lockout duration
  const lockoutUntil = permanent
    ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year (effectively permanent)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days by default

  if (scope === "all") {
    // Block from all lobbies - create a single wildcard violation
    violations.push({
      ipAddress,
      endpoint,
      resourceId: null, // null means all lobbies
      violationCount: permanent ? 10 : 5,
      lockoutUntil,
      status: permanent ? "BLOCKED" : "ACTIVE",
      userAgent: `Manual block by admin`,
      metadata: {
        manualBlock: true,
        adminUserId,
        reason,
        scope: "all",
      },
    });
  } else if (scope === "account") {
    // Block from specific accounts - get all lobbies for these accounts
    const lobbies = await prisma.lobby.findMany({
      where: {
        accountId: { in: accountIds },
      },
      select: {
        id: true,
      },
    });

    lobbies.forEach((lobby) => {
      violations.push({
        ipAddress,
        endpoint,
        resourceId: lobby.id,
        violationCount: permanent ? 10 : 5,
        lockoutUntil,
        status: permanent ? "BLOCKED" : "ACTIVE",
        userAgent: `Manual block by admin`,
        metadata: {
          manualBlock: true,
          adminUserId,
          reason,
          scope: "account",
          accountIds,
        },
      });
    });
  }

  // Create all violations
  await prisma.rateLimitViolation.createMany({
    data: violations,
  });

  logger.warn(
    {
      ipAddress,
      endpoint,
      scope,
      accountIds,
      permanent,
      adminUserId,
      reason,
      violationCount: violations.length,
    },
    "Manual IP block created by admin"
  );

  return {
    success: `IP ${ipAddress} blocked successfully. ${violations.length} violation record(s) created.`,
    violationsCreated: violations.length,
  };
}

/**
 * Convert temporary block to permanent block
 */
export async function makeBlockPermanent(
  violationId: string,
  adminUserId: string
) {
  const violation = await prisma.rateLimitViolation.findUnique({
    where: { id: violationId },
  });

  if (!violation) {
    throw new Error("Violation not found");
  }

  await prisma.rateLimitViolation.update({
    where: { id: violationId },
    data: {
      status: "BLOCKED",
      violationCount: 10,
      lockoutUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      metadata: {
        ...(violation.metadata as any),
        madePermanent: true,
        permanentBlockBy: adminUserId,
        permanentBlockAt: new Date().toISOString(),
      },
    },
  });

  logger.warn(
    {
      violationId,
      ipAddress: violation.ipAddress,
      endpoint: violation.endpoint,
      adminUserId,
    },
    "Temporary block converted to permanent by admin"
  );

  return { success: `Block for IP ${violation.ipAddress} is now permanent` };
}

/**
 * Delete a specific violation by ID
 */
export async function deleteViolation(violationId: string, adminUserId: string) {
  const violation = await prisma.rateLimitViolation.findUnique({
    where: { id: violationId },
  });

  if (!violation) {
    throw new Error("Violation not found");
  }

  await prisma.rateLimitViolation.delete({
    where: { id: violationId },
  });

  logger.info(
    {
      violationId,
      ipAddress: violation.ipAddress,
      endpoint: violation.endpoint,
      adminUserId,
    },
    "Violation deleted by admin"
  );

  return { success: `Violation deleted successfully` };
}
