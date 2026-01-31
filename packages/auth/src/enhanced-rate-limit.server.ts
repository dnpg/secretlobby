/**
 * Enhanced Rate Limiting with Progressive Delays & Violation Tracking
 *
 * Implements OWASP-recommended multi-layered brute force protection:
 * - Progressive lockout periods (exponential backoff)
 * - Violation tracking in database
 * - CAPTCHA integration for suspicious behavior
 * - IP blocking for persistent attackers
 */

import { prisma } from "@secretlobby/db";
import { createLogger } from "@secretlobby/logger";

const logger = createLogger({ service: "auth:enhanced-rate-limit" });

/**
 * Enhanced rate limit result with violation context
 */
export interface EnhancedRateLimitResult {
  allowed: boolean;
  reason?: "RATE_LIMIT" | "PROGRESSIVE_LOCKOUT" | "IP_BLOCKED";
  remaining: number;
  resetInSeconds: number;
  limit: number;
  requireCaptcha: boolean;
  violationCount?: number;
  lockoutUntil?: Date;
}

/**
 * Calculate progressive lockout time using exponential backoff
 *
 * Progressive lockout schedule:
 * - 1st violation: 15 minutes
 * - 2nd violation: 1 hour (60 min)
 * - 3rd violation: 4 hours (240 min)
 * - 4th violation: 24 hours (1440 min)
 * - 5-9 violations: 7 days (10,080 min)
 * - 10+ violations: Permanent block (status changes to BLOCKED)
 *
 * @param violationCount Number of violations
 * @returns Lockout time in minutes, or null for permanent block
 */
function calculateProgressiveLockout(violationCount: number): number | null {
  // Permanent block for 10+ violations
  if (violationCount >= 10) {
    return null; // Indicates permanent block
  }

  // Progressive schedule
  const schedule: Record<number, number> = {
    1: 15,                  // 15 minutes
    2: 60,                  // 1 hour
    3: 4 * 60,             // 4 hours
    4: 24 * 60,            // 24 hours
  };

  // 5-9 violations: 7 days
  if (violationCount >= 5) {
    return 7 * 24 * 60; // 7 days
  }

  return schedule[violationCount] || 15;
}


/**
 * Record or update a rate limit violation
 *
 * @param ip Client IP address
 * @param endpoint Endpoint identifier (e.g., "login", "lobby-password")
 * @param resourceId Optional resource ID (e.g., lobby ID)
 * @param userAgent Optional user agent string
 */
export async function recordViolation(
  ip: string,
  endpoint: string,
  resourceId?: string,
  userAgent?: string
): Promise<void> {
  try {
    // Find existing violation within last 24 hours for this IP and endpoint
    // Note: We check for ANY active violation for this IP/endpoint combination,
    // not just for a specific resource, to properly track repeat offenders
    const existingViolation = await prisma.rateLimitViolation.findFirst({
      where: {
        ipAddress: ip,
        endpoint,
        lastViolation: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
        status: { in: ["ACTIVE", "BLOCKED"] },
      },
      orderBy: {
        lastViolation: "desc",
      },
    });

    if (existingViolation) {
      // Update existing violation
      const newCount = existingViolation.violationCount + 1;
      const lockoutMinutes = calculateProgressiveLockout(newCount);

      // Handle permanent block (10+ violations)
      const isPermanentBlock = lockoutMinutes === null;
      const lockoutUntil = isPermanentBlock
        ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year in future (effectively permanent)
        : new Date(Date.now() + lockoutMinutes * 60 * 1000);

      await prisma.rateLimitViolation.update({
        where: { id: existingViolation.id },
        data: {
          violationCount: newCount,
          lastViolation: new Date(),
          lockoutUntil,
          status: isPermanentBlock ? "BLOCKED" : "ACTIVE",
          userAgent: userAgent || existingViolation.userAgent,
          // Update resourceId to current resource if provided
          resourceId: resourceId || existingViolation.resourceId,
        },
      });

      logger.warn(
        {
          ip,
          endpoint,
          resourceId,
          violationCount: newCount,
          lockoutMinutes: isPermanentBlock ? "PERMANENT" : lockoutMinutes,
          status: isPermanentBlock ? "BLOCKED" : "ACTIVE",
        },
        isPermanentBlock ? "Rate limit violation - PERMANENT BLOCK" : "Rate limit violation - progressive lockout"
      );
    } else {
      // Create new violation record
      const lockoutUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      await prisma.rateLimitViolation.create({
        data: {
          ipAddress: ip,
          endpoint,
          resourceId: resourceId || null,
          violationCount: 1,
          lockoutUntil,
          userAgent,
          status: "ACTIVE",
        },
      });

      logger.info(
        {
          ip,
          endpoint,
          resourceId,
        },
        "First rate limit violation"
      );
    }
  } catch (error) {
    logger.error({ error, ip, endpoint }, "Failed to record violation");
  }
}

/**
 * Check if IP is currently blocked
 *
 * @param ip Client IP address
 * @param endpoint Endpoint identifier
 * @param resourceId Optional resource ID
 * @returns Violation record if blocked, null otherwise
 */
export async function checkIPBlock(
  ip: string,
  endpoint: string,
  resourceId?: string
): Promise<{
  lockoutUntil: Date;
  violationCount: number;
  status: string;
  metadata?: any;
} | null> {
  try {
    // Check for violations in this order:
    // 1. Wildcard endpoint "all" + wildcard resource (applies to everything)
    // 2. Wildcard endpoint "all" + specific resource (applies to all endpoints for a resource)
    // 3. Specific endpoint + wildcard resource (applies to specific endpoint across all resources)
    // 4. Specific endpoint + specific resource (applies to specific endpoint and resource)
    const violation = await prisma.rateLimitViolation.findFirst({
      where: {
        ipAddress: ip,
        OR: [
          // Wildcard endpoint (matches "all" endpoints)
          {
            endpoint: "all",
            OR: [
              { resourceId: null }, // All endpoints, all resources
              { resourceId: resourceId || null }, // All endpoints, specific resource
            ],
          },
          // Specific endpoint
          {
            endpoint,
            OR: [
              { resourceId: null }, // Specific endpoint, all resources
              { resourceId: resourceId || null }, // Specific endpoint, specific resource
            ],
          },
        ],
        status: { in: ["ACTIVE", "BLOCKED"] },
        lockoutUntil: {
          gte: new Date(),
        },
      },
      orderBy: [
        { violationCount: "desc" }, // Prioritize higher violation counts (permanent blocks)
        { lastViolation: "desc" },
      ],
    });

    if (!violation) {
      return null;
    }

    // Check if should be marked as BLOCKED (10+ violations - permanent block)
    if (violation.violationCount >= 10 && violation.status === "ACTIVE") {
      await prisma.rateLimitViolation.update({
        where: { id: violation.id },
        data: { status: "BLOCKED" },
      });

      logger.error(
        {
          ip,
          endpoint,
          resourceId,
          violationCount: violation.violationCount,
        },
        "IP PERMANENTLY blocked due to persistent violations (10+)"
      );
    }

    return {
      lockoutUntil: violation.lockoutUntil!,
      violationCount: violation.violationCount,
      status: violation.status,
      metadata: violation.metadata || undefined,
    };
  } catch (error) {
    logger.error({ error, ip, endpoint }, "Failed to check IP block");
    return null;
  }
}

/**
 * Get violation history for an IP
 *
 * @param ip Client IP address
 * @param endpoint Endpoint identifier
 * @param hours Look back this many hours
 * @returns Array of violation counts and timestamps
 */
export async function getViolationHistory(
  ip: string,
  endpoint: string,
  hours: number = 24
): Promise<Array<{ count: number; timestamp: Date }>> {
  try {
    const violations = await prisma.rateLimitViolation.findMany({
      where: {
        ipAddress: ip,
        endpoint,
        createdAt: {
          gte: new Date(Date.now() - hours * 60 * 60 * 1000),
        },
      },
      select: {
        violationCount: true,
        lastViolation: true,
      },
      orderBy: {
        lastViolation: "desc",
      },
    });

    return violations.map((violation) => ({
      count: violation.violationCount,
      timestamp: violation.lastViolation,
    }));
  } catch (error) {
    logger.error({ error, ip, endpoint }, "Failed to get violation history");
    return [];
  }
}

/**
 * Reset violations for an IP (called on successful authentication)
 *
 * @param ip Client IP address
 * @param endpoint Endpoint identifier
 * @param resourceId Optional resource ID
 */
export async function resetViolations(
  ip: string,
  endpoint: string,
  resourceId?: string
): Promise<void> {
  try {
    await prisma.rateLimitViolation.updateMany({
      where: {
        ipAddress: ip,
        endpoint,
        resourceId: resourceId || null,
        status: "ACTIVE",
      },
      data: {
        status: "RESOLVED",
      },
    });

    logger.info(
      {
        ip,
        endpoint,
        resourceId,
      },
      "Violations reset after successful authentication"
    );
  } catch (error) {
    logger.error({ error, ip, endpoint }, "Failed to reset violations");
  }
}

/**
 * Check if CAPTCHA should be required based on violation history
 *
 * @param ip Client IP address
 * @param endpoint Endpoint identifier
 * @returns true if CAPTCHA should be required
 */
export async function shouldRequireCaptcha(
  ip: string,
  endpoint: string
): Promise<boolean> {
  try {
    const violation = await prisma.rateLimitViolation.findFirst({
      where: {
        ipAddress: ip,
        endpoint,
        status: "ACTIVE",
        violationCount: {
          gte: 3, // Require CAPTCHA after 3+ violations
        },
      },
    });

    return violation !== null;
  } catch (error) {
    logger.error({ error, ip, endpoint }, "Failed to check CAPTCHA requirement");
    return false;
  }
}

/**
 * Cleanup expired violations (should be run periodically)
 *
 * Marks violations as EXPIRED if:
 * - Lockout period has passed
 * - Last violation was more than 30 days ago
 */
export async function cleanupExpiredViolations(): Promise<number> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await prisma.rateLimitViolation.updateMany({
      where: {
        OR: [
          // Lockout expired and status still ACTIVE
          {
            status: "ACTIVE",
            lockoutUntil: {
              lt: new Date(),
            },
            lastViolation: {
              lt: thirtyDaysAgo,
            },
          },
          // Very old violations
          {
            status: { in: ["ACTIVE", "RESOLVED"] },
            createdAt: {
              lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days
            },
          },
        ],
      },
      data: {
        status: "EXPIRED",
      },
    });

    if (result.count > 0) {
      logger.info({ count: result.count }, "Cleaned up expired violations");
    }

    return result.count;
  } catch (error) {
    logger.error({ error }, "Failed to cleanup expired violations");
    return 0;
  }
}

/**
 * Get statistics about violations for monitoring
 */
export async function getViolationStats(hours: number = 24): Promise<{
  total: number;
  active: number;
  blocked: number;
  topIPs: Array<{ ip: string; count: number }>;
  topEndpoints: Array<{ endpoint: string; count: number }>;
}> {
  try {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const [total, active, blocked, topIPsRaw, topEndpointsRaw] = await Promise.all([
      prisma.rateLimitViolation.count({
        where: { createdAt: { gte: since } },
      }),
      prisma.rateLimitViolation.count({
        where: { status: "ACTIVE", createdAt: { gte: since } },
      }),
      prisma.rateLimitViolation.count({
        where: { status: "BLOCKED", createdAt: { gte: since } },
      }),
      prisma.rateLimitViolation.groupBy({
        by: ["ipAddress"],
        where: { createdAt: { gte: since } },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 10,
      }),
      prisma.rateLimitViolation.groupBy({
        by: ["endpoint"],
        where: { createdAt: { gte: since } },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 10,
      }),
    ]);

    return {
      total,
      active,
      blocked,
      topIPs: topIPsRaw.map((result) => ({ ip: result.ipAddress, count: result._count.id })),
      topEndpoints: topEndpointsRaw.map((result) => ({
        endpoint: result.endpoint,
        count: result._count.id,
      })),
    };
  } catch (error) {
    logger.error({ error }, "Failed to get violation stats");
    return {
      total: 0,
      active: 0,
      blocked: 0,
      topIPs: [],
      topEndpoints: [],
    };
  }
}
