/**
 * Default export: Server-side logger with Pino
 * For client-side code, use: import { createLogger } from "@secretlobby/logger/client"
 */
export {
  createLogger,
  createChildLogger,
  formatError,
  logger,
  type LogLevel,
  type LoggerOptions,
  type LogContext,
} from "./server.js";
