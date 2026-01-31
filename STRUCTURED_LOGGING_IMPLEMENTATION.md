# Structured Logging Implementation

## Summary

Replaced all `console.error()` calls with structured logging using Pino. This improves observability, debugging, and monitoring capabilities across the application.

## Changes Made

### 1. Created Logger Package (`@secretlobby/logger`)

**Location:** `packages/logger/`

Created a centralized logging package with:
- **pino** for structured logging
- **pino-pretty** for human-readable development logs
- Environment-based configuration
- Context-aware logging with child loggers
- Error formatting utilities

**Key Features:**
- Development: Pretty-printed colored logs for readability
- Production: JSON-formatted logs for aggregation and analysis
- Configurable log levels (trace, debug, info, warn, error, fatal)
- Service-based logging with context
- Child loggers for request-scoped logging

### 2. Replaced Console.error Calls

**Files Updated: 26 files across 4 packages and 2 apps**

#### Packages:
- **@secretlobby/email** (2 files)
  - `src/email-verification.ts` - Email verification errors
  - `src/password-reset.ts` - Password reset errors

- **@secretlobby/storage** (2 files)
  - `src/r2.ts` - Storage operation errors
  - `src/hls.ts` - HLS processing errors (waveform, duration, transcoding)

- **@secretlobby/console** (16 files)
  - Auth routes (OAuth, signup, login, password reset)
  - Billing routes (plans, checkout, success, methods)
  - Content routes (settings, theme, social, technical info)
  - API routes (media, webhooks)

- **@secretlobby/lobby** (2 files)
  - `app/components/PlayerView.tsx` - Audio playback errors
  - `app/components/AudioVisualizer.tsx` - Audio context errors

### 3. Testing

**Coverage:** 17 comprehensive tests
- Logger creation with various configurations
- Child logger context inheritance
- Error formatting (including nested causes)
- Log level handling
- Service context binding

**Test Results:**
```
Test Files  1 passed (1)
Tests       17 passed (17)
Duration    160ms
```

## Usage

### Basic Usage

```typescript
import { createLogger } from "@secretlobby/logger";

const logger = createLogger({ service: "my-service" });

logger.info("Operation started");
logger.error({ error: formatError(err) }, "Operation failed");
```

### With Context

```typescript
import { createLogger, createChildLogger } from "@secretlobby/logger";

const logger = createLogger({ service: "api" });

// Create child logger with request context
const requestLogger = createChildLogger(logger, {
  requestId: "req-123",
  userId: "user-456",
});

requestLogger.info("Processing request");
```

### Error Formatting

```typescript
import { createLogger, formatError } from "@secretlobby/logger";

const logger = createLogger({ service: "billing" });

try {
  await processPayment();
} catch (error) {
  logger.error(
    {
      customerId: "cust-123",
      error: formatError(error)  // Formats error with stack trace
    },
    "Payment processing failed"
  );
}
```

## Before vs After

### Before
```typescript
try {
  await sendEmail(to, subject, body);
} catch (error) {
  console.error("Failed to send email:", error);
}
```

**Issues:**
- Unstructured output
- No context (user ID, request ID, etc.)
- Difficult to query/filter
- No log levels
- No service identification

### After
```typescript
const logger = createLogger({ service: "email" });

try {
  await sendEmail(to, subject, body);
} catch (error) {
  logger.error(
    {
      to,
      subject,
      error: formatError(error)
    },
    "Failed to send email"
  );
}
```

**Benefits:**
- Structured JSON logs in production
- Searchable fields (to, subject, error details)
- Automatic service tagging
- Pretty output in development
- Stack traces captured
- Contextual information preserved

## Log Levels

- **trace**: Very detailed debugging (disabled by default)
- **debug**: Detailed debugging (enabled in development)
- **info**: General informational messages
- **warn**: Warning messages for non-critical issues
- **error**: Error messages for failures
- **fatal**: Critical failures requiring immediate attention

## Environment Configuration

**Development:**
- Log Level: `debug`
- Format: Pretty-printed with colors
- Output: Human-readable

**Production:**
- Log Level: `info`
- Format: JSON
- Output: Structured for log aggregation

## Integration Examples

### Service-Specific Logger

```typescript
// packages/payments/src/stripe.ts
import { createLogger } from "@secretlobby/logger";

const logger = createLogger({ service: "payments:stripe" });
```

### Request-Scoped Logging

```typescript
// apps/console/app/routes/api.webhooks.stripe.ts
const logger = createLogger({ service: "console:webhooks:stripe" });

export async function action({ request }: Route.ActionArgs) {
  const requestLogger = createChildLogger(logger, {
    requestId: request.headers.get("x-request-id"),
  });

  requestLogger.info("Processing webhook");
}
```

## Benefits

1. **Better Debugging**
   - Structured data makes it easy to filter and search logs
   - Stack traces are preserved and formatted
   - Context is always included

2. **Improved Monitoring**
   - JSON logs can be ingested by log aggregation tools
   - Service tags enable filtering by component
   - Error tracking is standardized

3. **Production-Ready**
   - Optimized JSON output for production
   - Log levels control verbosity
   - Performance-optimized with Pino

4. **Developer Experience**
   - Pretty-printed logs in development
   - Color-coded output
   - Easy to read and understand

## Migration Guide

To add logging to a new file:

1. **Import the logger:**
   ```typescript
   import { createLogger, formatError } from "@secretlobby/logger";
   ```

2. **Create a logger instance:**
   ```typescript
   const logger = createLogger({ service: "your-service-name" });
   ```

3. **Replace console.error:**
   ```typescript
   // Before
   console.error("Operation failed:", error);

   // After
   logger.error({ error: formatError(error) }, "Operation failed");
   ```

4. **Add context when relevant:**
   ```typescript
   logger.error(
     {
       userId: "user-123",
       action: "update_profile",
       error: formatError(error)
     },
     "Operation failed"
   );
   ```

## Future Improvements

1. **Log Aggregation**
   - Integrate with DataDog, Sentry, or CloudWatch
   - Set up alerts for error patterns
   - Create dashboards for monitoring

2. **Request Tracking**
   - Add request ID middleware
   - Correlate logs across services
   - Implement distributed tracing

3. **Sampling**
   - Implement log sampling for high-volume scenarios
   - Reduce costs while maintaining visibility

4. **Metrics**
   - Add metrics tracking alongside logging
   - Monitor error rates and latency
   - Set up SLOs

## Package Information

**Package:** `@secretlobby/logger`
**Version:** 0.0.0
**Dependencies:**
- `pino` ^10.3.0
- `pino-pretty` ^13.1.3

**Exports:**
- `createLogger`
- `createChildLogger`
- `formatError`
- `logger` (global instance)
- Types: `LogLevel`, `LoggerOptions`, `LogContext`

## Testing

Run tests:
```bash
pnpm --filter @secretlobby/logger test
```

Run with coverage:
```bash
pnpm --filter @secretlobby/logger test:coverage
```

## Files Modified

**Total:** 26 source files + 6 configuration files

**Configuration:**
- `packages/logger/package.json`
- `packages/logger/tsconfig.json`
- `packages/logger/vitest.config.ts`
- `vitest.workspace.ts`
- 4 package.json files (email, storage, console, lobby)

**Source Code:**
- 4 new files in `packages/logger/src/`
- 2 test files in `packages/logger/src/__tests__/`
- 20+ application files across packages and apps

---

**Implementation Date:** January 30, 2026
**Status:** ✅ Complete
