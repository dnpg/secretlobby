/**
 * Client-side logger implementation
 *
 * Provides the same API as the server logger but uses console methods
 * Safe to use in browser environments (React components, hooks, etc.)
 */

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export interface LoggerOptions {
  /**
   * Service name to identify the source of logs
   * @example "lobby:player", "console:media"
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

const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

/**
 * Browser-compatible logger that mimics Pino's API
 */
export class ClientLogger {
  private service?: string;
  private baseContext: Record<string, unknown>;
  private minLevel: number;

  constructor(options: LoggerOptions = {}) {
    // Detect development mode in browser environment
    let isDevelopment = false;
    if (typeof window !== "undefined") {
      isDevelopment =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";
    }

    this.service = options.service;
    this.baseContext = options.context || {};

    const level = options.level || (isDevelopment ? "debug" : "info");
    this.minLevel = LOG_LEVELS[level];
  }

  private shouldLog(level: LogLevel): boolean {
    // Check if debug mode is enabled via window.sldebug
    if (typeof window !== "undefined" && (window as any).sldebug === true) {
      return true; // Log everything when debug mode is enabled
    }
    return LOG_LEVELS[level] >= this.minLevel;
  }

  private formatMessage(level: LogLevel, obj: any, msg?: string): void {
    if (!this.shouldLog(level)) return;

    const context = { ...this.baseContext };
    if (this.service) {
      context.service = this.service;
    }

    // If obj is a string, it's the message
    if (typeof obj === "string") {
      msg = obj;
      obj = {};
    }

    const hasContext = Object.keys({ ...context, ...obj }).length > 0;
    const prefix = this.service ? `[${this.service}]` : "";

    // Choose console method based on level
    const consoleMethod = level === "fatal" || level === "error"
      ? console.error
      : level === "warn"
      ? console.warn
      : level === "debug" || level === "trace"
      ? console.debug
      : console.log;

    if (hasContext) {
      consoleMethod(prefix, msg || "", { ...context, ...obj });
    } else {
      consoleMethod(prefix, msg || "");
    }
  }

  trace(obj: any, msg?: string): void {
    this.formatMessage("trace", obj, msg);
  }

  debug(obj: any, msg?: string): void {
    this.formatMessage("debug", obj, msg);
  }

  info(obj: any, msg?: string): void {
    this.formatMessage("info", obj, msg);
  }

  warn(obj: any, msg?: string): void {
    this.formatMessage("warn", obj, msg);
  }

  error(obj: any, msg?: string): void {
    this.formatMessage("error", obj, msg);
  }

  fatal(obj: any, msg?: string): void {
    this.formatMessage("fatal", obj, msg);
  }

  /**
   * Create a child logger with additional context
   */
  child(context: LogContext): ClientLogger {
    return new ClientLogger({
      service: this.service,
      context: { ...this.baseContext, ...context },
      level: Object.keys(LOG_LEVELS).find(
        key => LOG_LEVELS[key as LogLevel] === this.minLevel
      ) as LogLevel,
    });
  }
}

/**
 * Create a logger instance for browser use
 *
 * @example
 * ```typescript
 * const logger = createLogger({ service: "lobby:player" });
 *
 * logger.info("Track changed");
 * logger.error({ error: err.message }, "Playback failed");
 * ```
 */
export function createLogger(options: LoggerOptions = {}): ClientLogger {
  return new ClientLogger(options);
}

/**
 * Global logger instance for general client-side use
 */
export const logger = createLogger({
  service: "secretlobby-client",
});

/**
 * Helper to create a child logger with additional context
 *
 * @example
 * ```typescript
 * const trackLogger = createChildLogger(logger, {
 *   trackId: "track-123"
 * });
 *
 * trackLogger.info("Playing track");
 * ```
 */
export function createChildLogger(
  parentLogger: ClientLogger,
  context: LogContext
): ClientLogger {
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
