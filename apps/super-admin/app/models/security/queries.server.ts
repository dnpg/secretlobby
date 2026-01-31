import { prisma, ViolationStatus, Prisma } from "@secretlobby/db";
import { getViolationStats } from "@secretlobby/auth/enhanced-rate-limit";

/**
 * Get violation lockout schedule label based on violation count
 */
export function getLockoutScheduleLabel(violationCount: number): string {
  if (violationCount >= 10) return "Permanent Block (10+)";
  if (violationCount >= 5) return "7 Days (5-9)";
  if (violationCount === 4) return "24 Hours (4th)";
  if (violationCount === 3) return "4 Hours (3rd)";
  if (violationCount === 2) return "1 Hour (2nd)";
  if (violationCount === 1) return "15 Minutes (1st)";
  return "Unknown";
}

/**
 * Filter options for violation lockout schedules
 */
export const LOCKOUT_FILTERS = [
  { value: "all", label: "All Violations", violationRange: null },
  { value: "1st", label: "15 Minutes (1st)", violationRange: [1, 1] as [number, number] },
  { value: "2nd", label: "1 Hour (2nd)", violationRange: [2, 2] as [number, number] },
  { value: "3rd", label: "4 Hours (3rd)", violationRange: [3, 3] as [number, number] },
  { value: "4th", label: "24 Hours (4th)", violationRange: [4, 4] as [number, number] },
  { value: "5-9", label: "7 Days (5-9)", violationRange: [5, 9] as [number, number] },
  { value: "10+", label: "Permanent (10+)", violationRange: [10, 999] as [number, number] },
] as const;

export interface SecurityFilters {
  timeFilter?: string;
  lockoutFilter?: string;
  ipAddress?: string;
  page?: number;
  pageSize?: number;
}

// Type for violation with lobby and account includes
type ViolationWithLobby = Prisma.RateLimitViolationGetPayload<{
  include: {
    lobby: {
      select: {
        id: true;
        password: true;
        accountId: true;
        account: {
          select: {
            id: true;
            name: true;
            slug: true;
          };
        };
      };
    };
  };
}>;

export interface PaginatedViolations {
  violations: ViolationWithLobby[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Get paginated violations with filters
 */
export async function getViolations(filters: SecurityFilters = {}): Promise<PaginatedViolations> {
  const {
    timeFilter = "24h",
    lockoutFilter = "all",
    ipAddress,
    page = 1,
    pageSize = 50,
  } = filters;

  // Calculate time range
  const hoursMap: Record<string, number> = {
    "1h": 1,
    "24h": 24,
    "7d": 24 * 7,
    "30d": 24 * 30,
  };
  const hours = hoursMap[timeFilter] || 24;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  // Build where clause
  const where: any = {
    createdAt: {
      gte: since,
    },
  };

  // Apply IP address filter
  if (ipAddress) {
    where.ipAddress = ipAddress;
  }

  // Apply lockout filter
  if (lockoutFilter !== "all") {
    const filterConfig = LOCKOUT_FILTERS.find((f) => f.value === lockoutFilter);
    if (filterConfig?.violationRange) {
      const [min, max] = filterConfig.violationRange;
      where.violationCount = {
        gte: min,
        lte: max,
      };
    }
  }

  // Get total count for pagination
  const total = await prisma.rateLimitViolation.count({ where });

  // Get paginated violations with lobby/account information
  const violations = await prisma.rateLimitViolation.findMany({
    where,
    include: {
      lobby: {
        select: {
          id: true,
          password: true,
          accountId: true,
          account: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
    },
    orderBy: {
      lastViolation: "desc",
    },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  return {
    violations,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

/**
 * Get blocked IPs with pagination
 */
export async function getBlockedIPs(page: number = 1, pageSize: number = 20) {
  const where = {
    status: ViolationStatus.BLOCKED,
    lockoutUntil: {
      gte: new Date(),
    },
  };

  const total = await prisma.rateLimitViolation.count({ where });

  const blockedIPs = await prisma.rateLimitViolation.findMany({
    where,
    include: {
      lobby: {
        select: {
          id: true,
          password: true,
          accountId: true,
          account: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
    },
    orderBy: {
      lastViolation: "desc",
    },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  return {
    blockedIPs,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

/**
 * Get active lockouts with pagination
 */
export async function getActiveLockouts(page: number = 1, pageSize: number = 20) {
  const where = {
    status: ViolationStatus.ACTIVE,
    lockoutUntil: {
      gte: new Date(),
    },
  };

  const total = await prisma.rateLimitViolation.count({ where });

  const activeLockouts = await prisma.rateLimitViolation.findMany({
    where,
    include: {
      lobby: {
        select: {
          id: true,
          password: true,
          accountId: true,
          account: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
    },
    orderBy: {
      lockoutUntil: "asc",
    },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  return {
    activeLockouts,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

/**
 * Get top endpoints with subdomain information
 */
export async function getTopEndpointsWithSubdomains(hours: number = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  // Get all violations for the timeframe with lobby/account info
  const violations = await prisma.rateLimitViolation.findMany({
    where: {
      createdAt: { gte: since },
    },
    select: {
      endpoint: true,
      lobby: {
        select: {
          account: {
            select: {
              slug: true,
            },
          },
        },
      },
    },
  });

  // Group by endpoint and subdomain
  const grouped = violations.reduce((acc, v) => {
    const key = `${v.endpoint}::${v.lobby?.account?.slug || "all"}`;
    if (!acc[key]) {
      acc[key] = {
        endpoint: v.endpoint,
        subdomain: v.lobby?.account?.slug || null,
        count: 0,
      };
    }
    acc[key].count++;
    return acc;
  }, {} as Record<string, { endpoint: string; subdomain: string | null; count: number }>);

  // Sort by count and take top 10
  return Object.values(grouped)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

/**
 * Get all statistics for the security dashboard
 */
export async function getSecurityStats() {
  const stats24h = await getViolationStats(24);
  const stats7d = await getViolationStats(24 * 7);
  const topEndpoints24h = await getTopEndpointsWithSubdomains(24);

  return {
    stats24h: {
      ...stats24h,
      topEndpoints: topEndpoints24h,
    },
    stats7d,
  };
}

/**
 * Get all accounts for the IP blocking form
 */
export async function getAllAccounts() {
  return await prisma.account.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
    },
    orderBy: {
      name: "asc",
    },
  });
}

/**
 * Get all lobbies for an account
 */
export async function getLobbiesForAccount(accountId: string) {
  return await prisma.lobby.findMany({
    where: {
      accountId,
    },
    select: {
      id: true,
      password: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

/**
 * Get unique IP addresses for autocomplete filter
 */
export async function getUniqueIPAddresses(timeFilter: string = "24h"): Promise<string[]> {
  const hoursMap: Record<string, number> = {
    "1h": 1,
    "24h": 24,
    "7d": 24 * 7,
    "30d": 24 * 30,
  };
  const hours = hoursMap[timeFilter] || 24;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const violations = await prisma.rateLimitViolation.findMany({
    where: {
      createdAt: {
        gte: since,
      },
    },
    select: {
      ipAddress: true,
    },
    distinct: ['ipAddress'],
    orderBy: {
      ipAddress: 'asc',
    },
  });

  return violations.map(v => v.ipAddress);
}

/**
 * Get full violation history for a specific IP address
 */
export async function getIPViolationHistory(ipAddress: string) {
  const violations = await prisma.rateLimitViolation.findMany({
    where: {
      ipAddress,
    },
    include: {
      lobby: {
        select: {
          id: true,
          password: true,
          accountId: true,
          account: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
    },
    orderBy: {
      lastViolation: "desc",
    },
  });

  // Get summary statistics
  const totalViolations = violations.length;
  const activeViolations = violations.filter(v => v.status === ViolationStatus.ACTIVE).length;
  const blockedViolations = violations.filter(v => v.status === ViolationStatus.BLOCKED).length;
  const endpoints = [...new Set(violations.map(v => v.endpoint))];
  const affectedAccounts = [...new Set(
    violations
      .map(v => v.lobby?.account)
      .filter(Boolean)
      .map(a => ({ id: a!.id, name: a!.name, slug: a!.slug }))
  )];

  // Get first and last violation timestamps
  const firstViolation = violations.length > 0
    ? violations[violations.length - 1].firstViolation
    : null;
  const lastViolation = violations.length > 0
    ? violations[0].lastViolation
    : null;

  return {
    ipAddress,
    violations,
    summary: {
      totalViolations,
      activeViolations,
      blockedViolations,
      endpoints,
      affectedAccounts,
      firstViolation,
      lastViolation,
    },
  };
}
