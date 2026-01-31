import { describe, it, expect, beforeEach, vi } from "vitest";
import { createLogger, formatError, createChildLogger, type LogLevel } from "../server";
import type pino from "pino";

describe("Logger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createLogger", () => {
    it("should create a logger with default options", () => {
      const logger = createLogger();

      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe("function");
      expect(typeof logger.error).toBe("function");
      expect(typeof logger.warn).toBe("function");
      expect(typeof logger.debug).toBe("function");
    });

    it("should create a logger with service name", () => {
      const logger = createLogger({ service: "test-service" });

      expect(logger).toBeDefined();
      // Pino logger should have bindings property
      expect(logger.bindings()).toMatchObject({ service: "test-service" });
    });

    it("should create a logger with custom log level", () => {
      const logger = createLogger({ level: "error" });

      expect(logger).toBeDefined();
      expect(logger.level).toBe("error");
    });

    it("should create a logger with additional context", () => {
      const logger = createLogger({
        service: "test",
        context: { version: "1.0.0", region: "us-east-1" },
      });

      expect(logger).toBeDefined();
      const bindings = logger.bindings();
      expect(bindings.service).toBe("test");
      expect(bindings.version).toBe("1.0.0");
      expect(bindings.region).toBe("us-east-1");
    });

    it("should use debug level in development", () => {
      process.env.NODE_ENV = "development";
      const logger = createLogger();

      expect(logger.level).toBe("debug");
    });

    it("should use info level in production", () => {
      process.env.NODE_ENV = "production";
      const logger = createLogger();

      expect(logger.level).toBe("info");
    });

    it("should respect explicit log level over default", () => {
      process.env.NODE_ENV = "production";
      const logger = createLogger({ level: "debug" });

      expect(logger.level).toBe("debug");
    });
  });

  describe("createChildLogger", () => {
    it("should create a child logger with additional context", () => {
      const parentLogger = createLogger({ service: "parent" });
      const childLogger = createChildLogger(parentLogger, {
        requestId: "req-123",
        userId: "user-456",
      });

      expect(childLogger).toBeDefined();
      const bindings = childLogger.bindings();
      expect(bindings.service).toBe("parent");
      expect(bindings.requestId).toBe("req-123");
      expect(bindings.userId).toBe("user-456");
    });

    it("should allow nested child loggers", () => {
      const parentLogger = createLogger({ service: "parent" });
      const childLogger1 = createChildLogger(parentLogger, { requestId: "req-123" });
      const childLogger2 = createChildLogger(childLogger1, { userId: "user-456" });

      const bindings = childLogger2.bindings();
      expect(bindings.service).toBe("parent");
      expect(bindings.requestId).toBe("req-123");
      expect(bindings.userId).toBe("user-456");
    });
  });

  describe("formatError", () => {
    it("should format Error objects with message, name, and stack", () => {
      const error = new Error("Test error");
      const formatted = formatError(error);

      expect(formatted).toMatchObject({
        message: "Test error",
        name: "Error",
      });
      expect(formatted.stack).toBeDefined();
      expect(typeof formatted.stack).toBe("string");
    });

    it("should format Error objects with cause", () => {
      const cause = new Error("Root cause");
      const error = new Error("Test error", { cause });
      const formatted = formatError(error);

      expect(formatted.message).toBe("Test error");
      expect(formatted.cause).toBeDefined();
      expect(formatted.cause).toMatchObject({
        message: "Root cause",
        name: "Error",
      });
    });

    it("should format nested error causes", () => {
      const rootCause = new Error("Root cause");
      const middleCause = new Error("Middle cause", { cause: rootCause });
      const error = new Error("Top error", { cause: middleCause });

      const formatted = formatError(error);

      expect(formatted.message).toBe("Top error");
      expect(formatted.cause).toBeDefined();
      expect((formatted.cause as any).message).toBe("Middle cause");
      expect((formatted.cause as any).cause).toBeDefined();
      expect((formatted.cause as any).cause.message).toBe("Root cause");
    });

    it("should format non-Error values as strings", () => {
      const formatted1 = formatError("string error");
      const formatted2 = formatError(42);
      const formatted3 = formatError(null);
      const formatted4 = formatError(undefined);

      expect(formatted1).toEqual({ message: "string error" });
      expect(formatted2).toEqual({ message: "42" });
      expect(formatted3).toEqual({ message: "null" });
      expect(formatted4).toEqual({ message: "undefined" });
    });

    it("should format objects without Error prototype", () => {
      const obj = { code: "ERR_TEST", details: "Something went wrong" };
      const formatted = formatError(obj);

      expect(formatted).toEqual({ message: "[object Object]" });
    });

    it("should handle Error subclasses", () => {
      class CustomError extends Error {
        constructor(
          message: string,
          public code: string
        ) {
          super(message);
          this.name = "CustomError";
        }
      }

      const error = new CustomError("Custom error message", "ERR_CUSTOM");
      const formatted = formatError(error);

      expect(formatted.message).toBe("Custom error message");
      expect(formatted.name).toBe("CustomError");
      expect(formatted.stack).toBeDefined();
    });
  });

  describe("Integration", () => {
    it("should allow logging with context and formatted errors", () => {
      const logger = createLogger({ service: "test" });
      const error = new Error("Test error");

      // This should not throw
      expect(() => {
        logger.error({ error: formatError(error), userId: "user-123" }, "Operation failed");
      }).not.toThrow();
    });

    it("should support all log levels", () => {
      const logger = createLogger({ service: "test", level: "trace" });

      expect(() => {
        logger.trace("Trace message");
        logger.debug("Debug message");
        logger.info("Info message");
        logger.warn("Warn message");
        logger.error("Error message");
        logger.fatal("Fatal message");
      }).not.toThrow();
    });
  });
});
