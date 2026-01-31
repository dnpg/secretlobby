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
  /** Optional custom key prefix for storage */
  keyPrefix?: string;
}

/**
 * Predefined rate limit configurations for common authentication scenarios
 */
export const RATE_LIMIT_CONFIGS = {
  /** Login endpoint: 5 attempts per 15 minutes */
  LOGIN: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    keyPrefix: "rl:login",
  } as RateLimitConfig,

  /** Signup endpoint: 3 attempts per hour */
  SIGNUP: {
    maxAttempts: 3,
    windowMs: 60 * 60 * 1000, // 1 hour
    keyPrefix: "rl:signup",
  } as RateLimitConfig,

  /** Password reset: 3 requests per hour */
  PASSWORD_RESET: {
    maxAttempts: 3,
    windowMs: 60 * 60 * 1000, // 1 hour
    keyPrefix: "rl:password-reset",
  } as RateLimitConfig,

  /** OAuth: 10 attempts per 15 minutes */
  OAUTH: {
    maxAttempts: 10,
    windowMs: 15 * 60 * 1000, // 15 minutes
    keyPrefix: "rl:oauth",
  } as RateLimitConfig,

  /** Email verification resend: 5 attempts per hour */
  EMAIL_VERIFICATION: {
    maxAttempts: 5,
    windowMs: 60 * 60 * 1000, // 1 hour
    keyPrefix: "rl:email-verify",
  } as RateLimitConfig,
} as const;

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

/**
 * In-memory rate limit store
 * For production, this should be replaced with Redis for distributed rate limiting
 */
class InMemoryRateLimitStore {
  private store = new Map<string, RateLimitRecord>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, record] of this.store.entries()) {
      if (record.resetAt < now) {
        this.store.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug({ cleaned }, "Cleaned up expired rate limit entries");
    }
  }

  get(key: string): RateLimitRecord | undefined {
    const record = this.store.get(key);

    // Return undefined if expired
    if (record && record.resetAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }

    return record;
  }

  set(key: string, record: RateLimitRecord): void {
    this.store.set(key, record);
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  reset(): void {
    this.store.clear();
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.store.clear();
  }

  // Get current size for monitoring
  size(): number {
    return this.store.size;
  }
}

// Singleton instance
let storeInstance: InMemoryRateLimitStore | null = null;

function getStore(): InMemoryRateLimitStore {
  if (!storeInstance) {
    storeInstance = new InMemoryRateLimitStore();
  }
  return storeInstance;
}

/**
 * Get client IP address from request
 */
function getClientIp(request: Request): string {
  // Check common headers for the real IP (behind proxies/load balancers)
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs, use the first one
    return forwardedFor.split(",")[0].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  // Fallback to connection info (not available in all environments)
  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  // Default to a placeholder (in development, this is often localhost)
  return "unknown";
}

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

/**
 * Check if a request should be rate limited
 *
 * @param request - The incoming request
 * @param config - Rate limit configuration
 * @param customKey - Optional custom key (e.g., email instead of IP)
 * @returns Rate limit result
 */
export function checkRateLimit(
  request: Request,
  config: RateLimitConfig,
  customKey?: string
): RateLimitResult {
  const store = getStore();
  const identifier = customKey || getClientIp(request);
  const key = `${config.keyPrefix || "rl"}:${identifier}`;

  const now = Date.now();
  const record = store.get(key);

  // No existing record or expired - create new
  if (!record) {
    const resetAt = now + config.windowMs;
    store.set(key, { count: 1, resetAt });

    return {
      allowed: true,
      remaining: config.maxAttempts - 1,
      resetInSeconds: Math.ceil(config.windowMs / 1000),
      limit: config.maxAttempts,
    };
  }

  // Increment count
  const newCount = record.count + 1;
  const resetInSeconds = Math.ceil((record.resetAt - now) / 1000);

  // Check if limit exceeded
  if (newCount > config.maxAttempts) {
    logger.warn(
      { identifier, key, count: newCount, limit: config.maxAttempts },
      "Rate limit exceeded"
    );

    return {
      allowed: false,
      remaining: 0,
      resetInSeconds,
      limit: config.maxAttempts,
    };
  }

  // Update count
  store.set(key, { ...record, count: newCount });

  return {
    allowed: true,
    remaining: config.maxAttempts - newCount,
    resetInSeconds,
    limit: config.maxAttempts,
  };
}

/**
 * Reset rate limit for a specific key (useful for successful actions)
 *
 * @param request - The request
 * @param config - Rate limit configuration
 * @param customKey - Optional custom key
 */
export function resetRateLimit(
  request: Request,
  config: RateLimitConfig,
  customKey?: string
): void {
  const store = getStore();
  const identifier = customKey || getClientIp(request);
  const key = `${config.keyPrefix || "rl"}:${identifier}`;

  store.delete(key);

  logger.debug({ identifier, key }, "Rate limit reset");
}

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

/**
 * Export store for testing purposes
 * @internal
 */
export function __getStoreForTesting(): InMemoryRateLimitStore {
  return getStore();
}

/**
 * Reset the store instance (for testing)
 * @internal
 */
export function __resetStoreForTesting(): void {
  if (storeInstance) {
    storeInstance.destroy();
    storeInstance = null;
  }
}
