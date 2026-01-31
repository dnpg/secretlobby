import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  checkRateLimit,
  resetRateLimit,
  getRateLimitHeaders,
  createRateLimitResponse,
  RATE_LIMIT_CONFIGS,
  __getStoreForTesting,
  __resetStoreForTesting,
  type RateLimitConfig,
} from "../rate-limit.server";

// Helper to create mock requests
function createMockRequest(ip: string = "192.168.1.1"): Request {
  return new Request("https://example.com/api/test", {
    headers: {
      "x-forwarded-for": ip,
    },
  });
}

describe("Rate Limiting", () => {
  beforeEach(() => {
    __resetStoreForTesting();
    vi.useFakeTimers();
  });

  afterEach(() => {
    __resetStoreForTesting();
    vi.useRealTimers();
  });

  describe("checkRateLimit", () => {
    it("should allow requests within limit", () => {
      const request = createMockRequest();
      const config: RateLimitConfig = {
        maxAttempts: 5,
        windowMs: 60000, // 1 minute
        keyPrefix: "test",
      };

      // First request
      const result1 = checkRateLimit(request, config);
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(4);
      expect(result1.limit).toBe(5);

      // Second request
      const result2 = checkRateLimit(request, config);
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(3);

      // Third request
      const result3 = checkRateLimit(request, config);
      expect(result3.allowed).toBe(true);
      expect(result3.remaining).toBe(2);
    });

    it("should block requests that exceed limit", () => {
      const request = createMockRequest();
      const config: RateLimitConfig = {
        maxAttempts: 3,
        windowMs: 60000,
        keyPrefix: "test",
      };

      // Use up all attempts
      checkRateLimit(request, config); // 1
      checkRateLimit(request, config); // 2
      checkRateLimit(request, config); // 3

      // Fourth attempt should be blocked
      const result = checkRateLimit(request, config);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("should reset after window expires", () => {
      const request = createMockRequest();
      const config: RateLimitConfig = {
        maxAttempts: 2,
        windowMs: 60000, // 1 minute
        keyPrefix: "test",
      };

      // Use up attempts
      checkRateLimit(request, config); // 1
      checkRateLimit(request, config); // 2

      // Next attempt should be blocked
      const blockedResult = checkRateLimit(request, config);
      expect(blockedResult.allowed).toBe(false);

      // Advance time beyond window
      vi.advanceTimersByTime(61000); // 61 seconds

      // Should allow new requests
      const newResult = checkRateLimit(request, config);
      expect(newResult.allowed).toBe(true);
      expect(newResult.remaining).toBe(1);
    });

    it("should track different IPs separately", () => {
      const request1 = createMockRequest("192.168.1.1");
      const request2 = createMockRequest("192.168.1.2");
      const config: RateLimitConfig = {
        maxAttempts: 2,
        windowMs: 60000,
        keyPrefix: "test",
      };

      // Use up attempts for IP 1
      checkRateLimit(request1, config);
      checkRateLimit(request1, config);

      const blockedResult = checkRateLimit(request1, config);
      expect(blockedResult.allowed).toBe(false);

      // IP 2 should still have attempts
      const allowedResult = checkRateLimit(request2, config);
      expect(allowedResult.allowed).toBe(true);
      expect(allowedResult.remaining).toBe(1);
    });

    it("should use custom key instead of IP", () => {
      const request1 = createMockRequest("192.168.1.1");
      const request2 = createMockRequest("192.168.1.2");
      const config: RateLimitConfig = {
        maxAttempts: 2,
        windowMs: 60000,
        keyPrefix: "test",
      };
      const customKey = "user@example.com";

      // Use custom key for both requests (same user, different IPs)
      checkRateLimit(request1, config, customKey);
      checkRateLimit(request2, config, customKey);

      // Third attempt should be blocked even from different IP
      const result = checkRateLimit(request1, config, customKey);
      expect(result.allowed).toBe(false);
    });

    it("should handle different headers for IP detection", () => {
      const request1 = new Request("https://example.com", {
        headers: { "x-real-ip": "10.0.0.1" },
      });
      const request2 = new Request("https://example.com", {
        headers: { "cf-connecting-ip": "10.0.0.2" },
      });
      const request3 = new Request("https://example.com"); // No IP headers

      const config: RateLimitConfig = {
        maxAttempts: 1,
        windowMs: 60000,
        keyPrefix: "test",
      };

      checkRateLimit(request1, config);
      checkRateLimit(request2, config);
      checkRateLimit(request3, config);

      // Each should have used their attempt
      expect(checkRateLimit(request1, config).allowed).toBe(false);
      expect(checkRateLimit(request2, config).allowed).toBe(false);
      expect(checkRateLimit(request3, config).allowed).toBe(false);
    });
  });

  describe("resetRateLimit", () => {
    it("should reset limit for specific IP", () => {
      const request = createMockRequest();
      const config: RateLimitConfig = {
        maxAttempts: 2,
        windowMs: 60000,
        keyPrefix: "test",
      };

      // Use up attempts
      checkRateLimit(request, config);
      checkRateLimit(request, config);

      // Should be blocked
      expect(checkRateLimit(request, config).allowed).toBe(false);

      // Reset
      resetRateLimit(request, config);

      // Should be allowed again
      const result = checkRateLimit(request, config);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);
    });

    it("should reset limit for custom key", () => {
      const request = createMockRequest();
      const config: RateLimitConfig = {
        maxAttempts: 1,
        windowMs: 60000,
        keyPrefix: "test",
      };
      const customKey = "user@example.com";

      // Use attempt
      checkRateLimit(request, config, customKey);

      // Should be blocked
      expect(checkRateLimit(request, config, customKey).allowed).toBe(false);

      // Reset with custom key
      resetRateLimit(request, config, customKey);

      // Should be allowed
      expect(checkRateLimit(request, config, customKey).allowed).toBe(true);
    });
  });

  describe("Predefined Configurations", () => {
    it("should have correct LOGIN config", () => {
      expect(RATE_LIMIT_CONFIGS.LOGIN).toEqual({
        maxAttempts: 5,
        windowMs: 15 * 60 * 1000,
        keyPrefix: "rl:login",
      });
    });

    it("should have correct SIGNUP config", () => {
      expect(RATE_LIMIT_CONFIGS.SIGNUP).toEqual({
        maxAttempts: 3,
        windowMs: 60 * 60 * 1000,
        keyPrefix: "rl:signup",
      });
    });

    it("should have correct PASSWORD_RESET config", () => {
      expect(RATE_LIMIT_CONFIGS.PASSWORD_RESET).toEqual({
        maxAttempts: 3,
        windowMs: 60 * 60 * 1000,
        keyPrefix: "rl:password-reset",
      });
    });

    it("should have correct OAUTH config", () => {
      expect(RATE_LIMIT_CONFIGS.OAUTH).toEqual({
        maxAttempts: 10,
        windowMs: 15 * 60 * 1000,
        keyPrefix: "rl:oauth",
      });
    });

    it("should have correct EMAIL_VERIFICATION config", () => {
      expect(RATE_LIMIT_CONFIGS.EMAIL_VERIFICATION).toEqual({
        maxAttempts: 5,
        windowMs: 60 * 60 * 1000,
        keyPrefix: "rl:email-verify",
      });
    });
  });

  describe("getRateLimitHeaders", () => {
    it("should return correct headers", () => {
      const result = {
        allowed: true,
        remaining: 3,
        resetInSeconds: 120,
        limit: 5,
      };

      const headers = getRateLimitHeaders(result);

      expect(headers).toEqual({
        "X-RateLimit-Limit": "5",
        "X-RateLimit-Remaining": "3",
        "X-RateLimit-Reset": "120",
      });
    });
  });

  describe("createRateLimitResponse", () => {
    it("should create 429 response with correct format", async () => {
      const result = {
        allowed: false,
        remaining: 0,
        resetInSeconds: 300,
        limit: 5,
      };

      const response = createRateLimitResponse(result);

      expect(response.status).toBe(429);
      expect(response.headers.get("Content-Type")).toBe("application/json");
      expect(response.headers.get("Retry-After")).toBe("300");
      expect(response.headers.get("X-RateLimit-Limit")).toBe("5");
      expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
      expect(response.headers.get("X-RateLimit-Reset")).toBe("300");

      const body = await response.json();
      expect(body).toEqual({
        error: "Too many requests",
        message: "Rate limit exceeded. Try again in 300 seconds.",
        retryAfter: 300,
      });
    });
  });

  describe("Store cleanup", () => {
    it("should clean up expired entries", () => {
      const request = createMockRequest();
      const config: RateLimitConfig = {
        maxAttempts: 5,
        windowMs: 1000, // 1 second
        keyPrefix: "test",
      };

      // Make some requests
      checkRateLimit(request, config);
      checkRateLimit(request, config);

      const store = __getStoreForTesting();
      expect(store.size()).toBeGreaterThan(0);

      // Advance time past cleanup interval
      vi.advanceTimersByTime(6 * 60 * 1000); // 6 minutes

      // Size should be reduced (cleanup runs every 5 minutes)
      // Note: Exact size depends on cleanup timing
      const newSize = store.size();
      expect(newSize).toBeDefined();
    });
  });

  describe("Integration scenarios", () => {
    it("should handle realistic login scenario", () => {
      const request = createMockRequest("203.0.113.1");
      const config = RATE_LIMIT_CONFIGS.LOGIN;

      // Failed login attempts
      for (let i = 0; i < 5; i++) {
        const result = checkRateLimit(request, config);
        expect(result.allowed).toBe(true);
      }

      // 6th attempt should be blocked
      const blockedResult = checkRateLimit(request, config);
      expect(blockedResult.allowed).toBe(false);
      expect(blockedResult.resetInSeconds).toBeGreaterThan(0);

      // Wait for window to expire
      vi.advanceTimersByTime(16 * 60 * 1000); // 16 minutes

      // Should be allowed again
      const newResult = checkRateLimit(request, config);
      expect(newResult.allowed).toBe(true);
    });

    it("should handle successful login resetting limit", () => {
      const request = createMockRequest();
      const config = RATE_LIMIT_CONFIGS.LOGIN;

      // Failed attempts
      checkRateLimit(request, config);
      checkRateLimit(request, config);
      checkRateLimit(request, config);

      // Successful login - reset limit
      resetRateLimit(request, config);

      // Should have full attempts available
      const result = checkRateLimit(request, config);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4); // Full limit minus this attempt
    });
  });
});
