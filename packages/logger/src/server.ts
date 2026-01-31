import pino, { type Logger as PinoLogger } from "pino";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export interface LoggerOptions {
  /**
   * Service name to identify the source of logs
   * @example "console", "lobby", "email", "storage"
   */
  service?: string;

  /**
   * Log level - defaults to "info" in production, "debug" in development
   */
  level?: LogLevel;

  /**
   * Additional base context to include in all logs
   */
  context?: Record<string, unknown>;
}

export interface LogContext {
  /**
   * User ID if available
   */
  userId?: string;

  /**
   * Account ID if available
   */
  accountId?: string;

  /**
   * Request ID for tracing
   */
  requestId?: string;

  /**
   * Any additional context
   */
  [key: string]: unknown;
}

/**
 * Create a logger instance with pino
 *
 * In development: Uses pino-pretty for human-readable output
 * In production: Outputs structured JSON logs
 *
 * @example
 * ```typescript
 * const logger = createLogger({ service: "email" });
 *
 * logger.info({ to: "user@example.com" }, "Sending verification email");
 * logger.error({ error: err.message }, "Failed to send email");
 * ```
 */
export function createLogger(options: LoggerOptions = {}): PinoLogger {
  const isDevelopment = process.env.NODE_ENV !== "production";
  const level = options.level || (isDevelopment ? "debug" : "info");

  const baseConfig: pino.LoggerOptions = {
    level,
    base: {
      service: options.service,
      ...(options.context || {}),
    },
  };

  // In development, use pretty printing for better readability
  if (isDevelopment) {
    return pino({
      ...baseConfig,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname",
          singleLine: false,
        },
      },
    });
  }

  // In production, use JSON logs for structured logging
  return pino(baseConfig);
}

/**
 * Global logger instance for general use
 * Service-specific packages should create their own logger with a service name
 */
export const logger = createLogger({
  service: process.env.SERVICE_NAME || "secretlobby",
});

/**
 * Helper to create a child logger with additional context
 *
 * @example
 * ```typescript
 * const requestLogger = createChildLogger(logger, {
 *   requestId: "req-123",
 *   userId: "user-456"
 * });
 *
 * requestLogger.info("Processing request");
 * ```
 */
export function createChildLogger(
  parentLogger: PinoLogger,
  context: LogContext
): PinoLogger {
  return parentLogger.child(context);
}

/**
 * Format an error for logging
 * Extracts message, stack trace, and additional properties
 */
export function formatError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
      ...(error.cause ? { cause: formatError(error.cause) } : {}),
    };
  }

  return {
    message: String(error),
  };
}
