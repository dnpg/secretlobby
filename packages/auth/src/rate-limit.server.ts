import { Redis } from "ioredis";
import { prisma } from "@secretlobby/db";
import { createLogger } from "@secretlobby/logger";

const logger = createLogger({ service: "auth:rate-limit" });

/**
 * Rate limit configuration for different endpoints
 */
export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  maxAttempts: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Key prefix for storage */
  keyPrefix: string;
}

/**
 * Predefined rate limit configurations for common authentication scenarios
 *
 * Note: These are IP-based limits to prevent abuse/bots.
 * Individual user accounts have separate lockout (3 attempts in password.server.ts).
 *
 * The IP limits are intentionally higher to allow legitimate users who:
 * - Mistype their email multiple times
 * - Try different emails they might have used
 * - Have caps lock on, etc.
 */
export const RATE_LIMIT_CONFIGS = {
  /**
   * Login endpoint: 15 attempts per 15 minutes (IP-based)
   * - High enough to allow email mistakes
   * - User accounts lock after 3 wrong passwords anyway
   * - Progressive lockout kicks in for persistent abuse
   */
  LOGIN: {
    maxAttempts: 15,
    windowMs: 15 * 60 * 1000, // 15 minutes
    keyPrefix: "rl:login",
  } as RateLimitConfig,

  /** Signup endpoint: 5 attempts per hour */
  SIGNUP: {
    maxAttempts: 5,
    windowMs: 60 * 60 * 1000, // 1 hour
    keyPrefix: "rl:signup",
  } as RateLimitConfig,

  /** Password reset: 5 requests per hour */
  PASSWORD_RESET: {
    maxAttempts: 5,
    windowMs: 60 * 60 * 1000, // 1 hour
    keyPrefix: "rl:password-reset",
  } as RateLimitConfig,

  /** OAuth: 15 attempts per 15 minutes */
  OAUTH: {
    maxAttempts: 15,
    windowMs: 15 * 60 * 1000, // 15 minutes
    keyPrefix: "rl:oauth",
  } as RateLimitConfig,

  /** Email verification resend: 5 attempts per hour */
  EMAIL_VERIFICATION: {
    maxAttempts: 5,
    windowMs: 60 * 60 * 1000, // 1 hour
    keyPrefix: "rl:email-verify",
  } as RateLimitConfig,

  /** Interested signup (marketing email collection): 5 per hour per IP */
  INTERESTED_SIGNUP: {
    maxAttempts: 5,
    windowMs: 60 * 60 * 1000, // 1 hour
    keyPrefix: "rl:interested-signup",
  } as RateLimitConfig,

  /**
   * Lobby password: 10 attempts per 15 minutes
   * - Higher than user login since there's no user account to lock
   * - Progressive lockout handles persistent abuse
   */
  LOBBY_PASSWORD: {
    maxAttempts: 10,
    windowMs: 15 * 60 * 1000, // 15 minutes
    keyPrefix: "rl:lobby-password",
  } as RateLimitConfig,
} as const;

// =============================================================================
// Redis Connection (Primary)
// =============================================================================

let redisClient: Redis | null = null;
let redisAvailable = false;
let redisChecked = false;

/**
 * Get Redis client instance (singleton)
 * Returns null if Redis is not configured or connection failed
 */
async function getRedisClient(): Promise<Redis | null> {
  if (redisChecked && !redisAvailable) {
    return null;
  }

  if (redisClient && redisAvailable) {
    return redisClient;
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    logger.info("REDIS_URL not configured - using database fallback for rate limiting");
    redisChecked = true;
    redisAvailable = false;
    return null;
  }

  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
    });

    // Test connection
    await redisClient.ping();
    redisAvailable = true;
    redisChecked = true;
    logger.info("Redis connected for rate limiting");
    return redisClient;
  } catch (err) {
    logger.warn({ error: (err as Error).message }, "Redis unavailable - using database fallback");
    redisChecked = true;
    redisAvailable = false;
    if (redisClient) {
      redisClient.disconnect();
      redisClient = null;
    }
    return null;
  }
}

// =============================================================================
// IP Detection
// =============================================================================

/**
 * Get client IP address from request
 */
export function getClientIp(request: Request): string {
  // Cloudflare
  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  // Standard proxy headers
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  // Fly.io
  const flyClientIp = request.headers.get("fly-client-ip");
  if (flyClientIp) {
    return flyClientIp;
  }

  // Development: detect localhost
  try {
    const url = new URL(request.url);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return "127.0.0.1";
    }
  } catch {
    // Ignore URL parsing errors
  }

  return "unknown";
}

// =============================================================================
// Rate Limiting Result
// =============================================================================

/**
 * Result of a rate limit check
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Number of requests remaining in current window */
  remaining: number;
  /** Number of seconds until the limit resets */
  resetInSeconds: number;
  /** Total limit for this endpoint */
  limit: number;
}

// =============================================================================
// Redis-Based Rate Limiting (Primary)
// =============================================================================

async function checkRateLimitRedis(
  redis: Redis,
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const ttlSeconds = Math.ceil(config.windowMs / 1000);

  // Atomic increment with TTL
  const count = await redis.incr(key);

  // Set TTL only on first request (when count is 1)
  if (count === 1) {
    await redis.expire(key, ttlSeconds);
  }

  // Get actual TTL
  const ttl = await redis.ttl(key);
  const resetInSeconds = ttl > 0 ? ttl : ttlSeconds;

  return {
    allowed: count <= config.maxAttempts,
    remaining: Math.max(0, config.maxAttempts - count),
    resetInSeconds,
    limit: config.maxAttempts,
  };
}

async function resetRateLimitRedis(redis: Redis, key: string): Promise<void> {
  await redis.del(key);
}

// =============================================================================
// Database-Based Rate Limiting (Fallback)
// =============================================================================

async function checkRateLimitDatabase(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const windowStart = new Date(Date.now() - config.windowMs);
  const endpoint = config.keyPrefix;

  try {
    // Find or create rate limit record
    const existing = await prisma.rateLimitViolation.findFirst({
      where: {
        ipAddress: identifier,
        endpoint,
        createdAt: { gte: windowStart },
        status: "ACTIVE",
      },
      orderBy: { createdAt: "desc" },
    });

    if (!existing) {
      // First attempt in this window
      await prisma.rateLimitViolation.create({
        data: {
          ipAddress: identifier,
          endpoint,
          violationCount: 1,
          status: "ACTIVE",
          lockoutUntil: new Date(Date.now() + config.windowMs),
        },
      });

      return {
        allowed: true,
        remaining: config.maxAttempts - 1,
        resetInSeconds: Math.ceil(config.windowMs / 1000),
        limit: config.maxAttempts,
      };
    }

    // Increment count
    const newCount = existing.violationCount + 1;
    await prisma.rateLimitViolation.update({
      where: { id: existing.id },
      data: {
        violationCount: newCount,
        lastViolation: new Date(),
      },
    });

    const resetInSeconds = Math.max(
      0,
      Math.ceil((existing.createdAt.getTime() + config.windowMs - Date.now()) / 1000)
    );

    return {
      allowed: newCount <= config.maxAttempts,
      remaining: Math.max(0, config.maxAttempts - newCount),
      resetInSeconds,
      limit: config.maxAttempts,
    };
  } catch (err) {
    logger.error({ error: err, identifier, endpoint }, "Database rate limit check failed");
    // On database error, allow the request but log it
    return {
      allowed: true,
      remaining: config.maxAttempts,
      resetInSeconds: Math.ceil(config.windowMs / 1000),
      limit: config.maxAttempts,
    };
  }
}

async function resetRateLimitDatabase(
  identifier: string,
  config: RateLimitConfig
): Promise<void> {
  const endpoint = config.keyPrefix;

  try {
    await prisma.rateLimitViolation.updateMany({
      where: {
        ipAddress: identifier,
        endpoint,
        status: "ACTIVE",
      },
      data: {
        status: "RESOLVED",
      },
    });
  } catch (err) {
    logger.error({ error: err, identifier, endpoint }, "Failed to reset database rate limit");
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Check if a request should be rate limited
 *
 * Uses Redis if available, falls back to database otherwise.
 * This ensures rate limiting always works, even without Redis.
 *
 * @param request - The incoming request
 * @param config - Rate limit configuration
 * @param customKey - Optional custom key (e.g., email instead of IP)
 * @returns Rate limit result
 */
export async function checkRateLimit(
  request: Request,
  config: RateLimitConfig,
  customKey?: string
): Promise<RateLimitResult> {
  const identifier = customKey || getClientIp(request);
  const key = `${config.keyPrefix}:${identifier}`;

  // Try Redis first
  const redis = await getRedisClient();
  if (redis) {
    try {
      const result = await checkRateLimitRedis(redis, key, config);

      if (!result.allowed) {
        logger.warn(
          { identifier, endpoint: config.keyPrefix, remaining: result.remaining },
          "Rate limit exceeded (Redis)"
        );
      }

      return result;
    } catch (err) {
      logger.warn({ error: (err as Error).message }, "Redis rate limit failed, using database");
      // Fall through to database
    }
  }

  // Fallback to database
  const result = await checkRateLimitDatabase(identifier, config);

  if (!result.allowed) {
    logger.warn(
      { identifier, endpoint: config.keyPrefix, remaining: result.remaining },
      "Rate limit exceeded (Database)"
    );
  }

  return result;
}

/**
 * Reset rate limit for a specific key (call on successful authentication)
 *
 * @param request - The request
 * @param config - Rate limit configuration
 * @param customKey - Optional custom key
 */
export async function resetRateLimit(
  request: Request,
  config: RateLimitConfig,
  customKey?: string
): Promise<void> {
  const identifier = customKey || getClientIp(request);
  const key = `${config.keyPrefix}:${identifier}`;

  // Try Redis first
  const redis = await getRedisClient();
  if (redis) {
    try {
      await resetRateLimitRedis(redis, key);
      logger.debug({ identifier, endpoint: config.keyPrefix }, "Rate limit reset (Redis)");
      return;
    } catch (err) {
      logger.warn({ error: (err as Error).message }, "Redis reset failed, using database");
    }
  }

  // Fallback to database
  await resetRateLimitDatabase(identifier, config);
  logger.debug({ identifier, endpoint: config.keyPrefix }, "Rate limit reset (Database)");
}

/**
 * Clear all rate limits for a specific IP address
 *
 * @param ipAddress - The IP address to clear limits for
 */
export async function clearRateLimitsForIP(ipAddress: string): Promise<number> {
  let cleared = 0;

  // Clear from Redis if available
  const redis = await getRedisClient();
  if (redis) {
    try {
      for (const config of Object.values(RATE_LIMIT_CONFIGS)) {
        const key = `${config.keyPrefix}:${ipAddress}`;
        const deleted = await redis.del(key);
        cleared += deleted;
      }
    } catch (err) {
      logger.warn({ error: (err as Error).message }, "Redis clear failed");
    }
  }

  // Always clear from database too
  try {
    const result = await prisma.rateLimitViolation.updateMany({
      where: {
        ipAddress,
        status: "ACTIVE",
      },
      data: {
        status: "RESOLVED",
      },
    });
    cleared += result.count;
  } catch (err) {
    logger.error({ error: err, ipAddress }, "Failed to clear database rate limits");
  }

  if (cleared > 0) {
    logger.info({ ipAddress, cleared }, "Cleared rate limits for IP");
  }

  return cleared;
}

/**
 * Clear all rate limits (use with caution - for admin/maintenance only)
 */
export async function clearAllRateLimits(): Promise<number> {
  let cleared = 0;

  // Clear from Redis if available
  const redis = await getRedisClient();
  if (redis) {
    try {
      for (const config of Object.values(RATE_LIMIT_CONFIGS)) {
        const pattern = `${config.keyPrefix}:*`;
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(...keys);
          cleared += keys.length;
        }
      }
    } catch (err) {
      logger.warn({ error: (err as Error).message }, "Redis clear all failed");
    }
  }

  // Always clear from database too
  try {
    const result = await prisma.rateLimitViolation.updateMany({
      where: {
        status: "ACTIVE",
        endpoint: {
          in: Object.values(RATE_LIMIT_CONFIGS).map((c) => c.keyPrefix),
        },
      },
      data: {
        status: "RESOLVED",
      },
    });
    cleared += result.count;
  } catch (err) {
    logger.error({ error: err }, "Failed to clear all database rate limits");
  }

  logger.info({ cleared }, "Cleared all rate limits");
  return cleared;
}

/**
 * Get current rate limit status for an IP (for debugging/admin)
 */
export async function getRateLimitStatus(
  ipAddress: string
): Promise<Record<string, { count: number; ttl: number; source: "redis" | "database" } | null>> {
  const result: Record<string, { count: number; ttl: number; source: "redis" | "database" } | null> = {};

  // Try Redis first
  const redis = await getRedisClient();

  for (const [name, config] of Object.entries(RATE_LIMIT_CONFIGS)) {
    // Check Redis
    if (redis) {
      try {
        const key = `${config.keyPrefix}:${ipAddress}`;
        const count = await redis.get(key);
        const ttl = await redis.ttl(key);

        if (count !== null) {
          result[name] = {
            count: parseInt(count, 10),
            ttl: ttl > 0 ? ttl : 0,
            source: "redis",
          };
          continue;
        }
      } catch {
        // Fall through to database
      }
    }

    // Check database
    try {
      const windowStart = new Date(Date.now() - config.windowMs);
      const record = await prisma.rateLimitViolation.findFirst({
        where: {
          ipAddress,
          endpoint: config.keyPrefix,
          createdAt: { gte: windowStart },
          status: "ACTIVE",
        },
        orderBy: { createdAt: "desc" },
      });

      if (record) {
        const ttl = Math.max(
          0,
          Math.ceil((record.createdAt.getTime() + config.windowMs - Date.now()) / 1000)
        );
        result[name] = {
          count: record.violationCount,
          ttl,
          source: "database",
        };
      } else {
        result[name] = null;
      }
    } catch {
      result[name] = null;
    }
  }

  return result;
}

// =============================================================================
// Response Helpers
// =============================================================================

/**
 * Create response headers for rate limit information
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": result.limit.toString(),
    "X-RateLimit-Remaining": result.remaining.toString(),
    "X-RateLimit-Reset": result.resetInSeconds.toString(),
  };
}

/**
 * Helper to create a 429 Too Many Requests response
 */
export function createRateLimitResponse(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({
      error: "Too many requests",
      message: `Rate limit exceeded. Try again in ${result.resetInSeconds} seconds.`,
      retryAfter: result.resetInSeconds,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": result.resetInSeconds.toString(),
        ...getRateLimitHeaders(result),
      },
    }
  );
}

// =============================================================================
// Connection Management
// =============================================================================

/**
 * Close Redis connection (for graceful shutdown)
 */
export async function closeRateLimitConnection(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    redisAvailable = false;
    logger.info("Redis rate limit connection closed");
  }
}

/**
 * Check which storage backend is being used
 */
export function getRateLimitBackend(): "redis" | "database" {
  return redisAvailable ? "redis" : "database";
}
