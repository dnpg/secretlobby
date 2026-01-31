import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getRequiredEnv,
  getEnvWithFallback,
  validateAuthEnv,
  getSessionSecret,
} from "../env.server";

describe("Environment Utilities", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Clone the environment
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe("getRequiredEnv", () => {
    it("should return the environment variable value when set", () => {
      process.env.TEST_VAR = "test-value";

      const result = getRequiredEnv("TEST_VAR");

      expect(result).toBe("test-value");
    });

    it("should throw error when environment variable is not set", () => {
      delete process.env.TEST_VAR;

      expect(() => getRequiredEnv("TEST_VAR")).toThrow(
        "Missing required environment variable: TEST_VAR"
      );
    });

    it("should throw error when environment variable is empty string", () => {
      process.env.TEST_VAR = "";

      expect(() => getRequiredEnv("TEST_VAR")).toThrow(
        "Missing required environment variable: TEST_VAR"
      );
    });

    it("should include context in error message", () => {
      delete process.env.TEST_VAR;

      expect(() => getRequiredEnv("TEST_VAR", "Used for authentication")).toThrow(
        "Missing required environment variable: TEST_VAR (Used for authentication)"
      );
    });

    it("should include helpful message in error", () => {
      delete process.env.TEST_VAR;

      expect(() => getRequiredEnv("TEST_VAR")).toThrow(
        "Please set TEST_VAR in your .env file or environment"
      );
    });
  });

  describe("getEnvWithFallback", () => {
    it("should return the environment variable value when set", () => {
      process.env.TEST_VAR = "actual-value";

      const result = getEnvWithFallback("TEST_VAR", "fallback-value");

      expect(result).toBe("actual-value");
    });

    it("should return fallback when environment variable is not set", () => {
      delete process.env.TEST_VAR;

      const result = getEnvWithFallback("TEST_VAR", "fallback-value");

      expect(result).toBe("fallback-value");
    });

    it("should return fallback when environment variable is empty string", () => {
      process.env.TEST_VAR = "";

      const result = getEnvWithFallback("TEST_VAR", "fallback-value");

      expect(result).toBe("fallback-value");
    });

    it("should work with different fallback types", () => {
      delete process.env.TEST_VAR;

      expect(getEnvWithFallback("TEST_VAR", "localhost")).toBe("localhost");
      expect(getEnvWithFallback("TEST_VAR", "http://localhost:3000")).toBe(
        "http://localhost:3000"
      );
      expect(getEnvWithFallback("TEST_VAR", "development")).toBe("development");
    });
  });

  describe("validateAuthEnv", () => {
    it("should not throw when all required variables are set correctly", () => {
      process.env.SESSION_SECRET = "this-is-a-very-long-secret-at-least-32-characters-long";

      expect(() => validateAuthEnv()).not.toThrow();
    });

    it("should throw when SESSION_SECRET is not set", () => {
      delete process.env.SESSION_SECRET;

      expect(() => validateAuthEnv()).toThrow("Auth environment validation failed");
      expect(() => validateAuthEnv()).toThrow("SESSION_SECRET is not set");
    });

    it("should throw when SESSION_SECRET is too short", () => {
      process.env.SESSION_SECRET = "too-short";

      expect(() => validateAuthEnv()).toThrow("Auth environment validation failed");
      expect(() => validateAuthEnv()).toThrow(
        "SESSION_SECRET must be at least 32 characters"
      );
    });

    it("should show current length in error message when too short", () => {
      process.env.SESSION_SECRET = "short";

      expect(() => validateAuthEnv()).toThrow("currently 5");
    });

    it("should accept SESSION_SECRET that is exactly 32 characters", () => {
      process.env.SESSION_SECRET = "a".repeat(32);

      expect(() => validateAuthEnv()).not.toThrow();
    });

    it("should accept SESSION_SECRET longer than 32 characters", () => {
      process.env.SESSION_SECRET = "a".repeat(64);

      expect(() => validateAuthEnv()).not.toThrow();
    });

    it("should include helpful message in error", () => {
      delete process.env.SESSION_SECRET;

      expect(() => validateAuthEnv()).toThrow(
        "Please check your .env file and ensure all required variables are set"
      );
    });
  });

  describe("getSessionSecret", () => {
    it("should return SESSION_SECRET when properly set", () => {
      const secret = "this-is-a-very-long-secret-at-least-32-characters-long";
      process.env.SESSION_SECRET = secret;

      const result = getSessionSecret();

      expect(result).toBe(secret);
    });

    it("should throw when SESSION_SECRET is not set", () => {
      delete process.env.SESSION_SECRET;

      expect(() => getSessionSecret()).toThrow("Missing required environment variable");
      expect(() => getSessionSecret()).toThrow("SESSION_SECRET");
    });

    it("should throw when SESSION_SECRET is empty", () => {
      process.env.SESSION_SECRET = "";

      expect(() => getSessionSecret()).toThrow("Missing required environment variable");
    });

    it("should throw when SESSION_SECRET is too short", () => {
      process.env.SESSION_SECRET = "too-short-secret";

      expect(() => getSessionSecret()).toThrow(
        "SESSION_SECRET must be at least 32 characters long"
      );
    });

    it("should include current length in error message", () => {
      process.env.SESSION_SECRET = "short";

      expect(() => getSessionSecret()).toThrow("currently 5 characters");
    });

    it("should include helpful generation command in error", () => {
      process.env.SESSION_SECRET = "short";

      expect(() => getSessionSecret()).toThrow("openssl rand -base64 32");
    });

    it("should include context about session encryption", () => {
      delete process.env.SESSION_SECRET;

      expect(() => getSessionSecret()).toThrow("Required for session encryption");
    });

    it("should accept exactly 32 characters", () => {
      process.env.SESSION_SECRET = "a".repeat(32);

      expect(() => getSessionSecret()).not.toThrow();
      expect(getSessionSecret()).toBe("a".repeat(32));
    });

    it("should accept more than 32 characters", () => {
      const secret = "a".repeat(64);
      process.env.SESSION_SECRET = secret;

      expect(() => getSessionSecret()).not.toThrow();
      expect(getSessionSecret()).toBe(secret);
    });

    it("should work with base64 encoded secrets", () => {
      const secret = "SGVsbG8gV29ybGQhIFRoaXMgaXMgYSBiYXNlNjQgZW5jb2RlZCBzZWNyZXQ=";
      process.env.SESSION_SECRET = secret;

      expect(() => getSessionSecret()).not.toThrow();
      expect(getSessionSecret()).toBe(secret);
    });

    it("should work with special characters in secret", () => {
      const secret = "a!@#$%^&*()_+-=[]{}|;:',.<>?/".repeat(2); // > 32 chars
      process.env.SESSION_SECRET = secret;

      expect(() => getSessionSecret()).not.toThrow();
      expect(getSessionSecret()).toBe(secret);
    });
  });

  describe("Security considerations", () => {
    it("should not allow weak secrets (< 32 chars) to prevent brute force", () => {
      const weakSecrets = [
        "short",
        "12345678",
        "password",
        "secret123",
        "my-session-secret",
        "a".repeat(31), // 31 chars is still too short
      ];

      for (const weakSecret of weakSecrets) {
        process.env.SESSION_SECRET = weakSecret;
        expect(() => getSessionSecret()).toThrow();
      }
    });

    it("should accept strong secrets (>= 32 chars)", () => {
      const strongSecrets = [
        "a".repeat(32),
        "this-is-a-very-long-secret-at-least-32-characters-long",
        "SGVsbG8gV29ybGQhIFRoaXMgaXMgYSBiYXNlNjQgZW5jb2RlZCBzZWNyZXQ=",
        "1234567890123456789012345678901234567890", // 40 numeric chars
      ];

      for (const strongSecret of strongSecrets) {
        process.env.SESSION_SECRET = strongSecret;
        expect(() => getSessionSecret()).not.toThrow();
        expect(getSessionSecret()).toBe(strongSecret);
      }
    });
  });
});
