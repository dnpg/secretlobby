---
sidebar_position: 6
slug: /packages/logger
---

# Logger

The logger package provides structured logging using Pino.

## Overview

- **Package**: `@secretlobby/logger`
- **Technologies**: Pino

## Usage

### Server-Side Logging

```typescript
import { logger } from '@secretlobby/logger/server';

// Log levels
logger.info('User logged in', { userId: '123' });
logger.warn('Rate limit approaching', { remaining: 10 });
logger.error('Database connection failed', { error });
logger.debug('Request received', { method: 'GET', path: '/api/users' });
```

### Client-Side Logging

```typescript
import { logger } from '@secretlobby/logger/client';

// Client logs are sent to the server for aggregation
logger.info('Page viewed', { page: 'dashboard' });
logger.error('Client error', { error: error.message });
```

### Request Logging

```typescript
import { requestLogger } from '@secretlobby/logger/server';

// Use as middleware
app.use(requestLogger);
```

### Child Loggers

Create child loggers with additional context:

```typescript
const userLogger = logger.child({ userId: '123' });

userLogger.info('Action performed', { action: 'upload' });
// Output includes userId in every log
```

## Log Levels

| Level | Usage |
|-------|-------|
| `fatal` | Application crash |
| `error` | Error conditions |
| `warn` | Warning conditions |
| `info` | Informational messages |
| `debug` | Debug messages |
| `trace` | Trace messages |

## Configuration

Configure logging via environment variables:

```bash
# Log level (default: info)
LOG_LEVEL=debug

# Pretty printing in development
LOG_PRETTY=true
```

## Output Format

Logs are output as JSON in production:

```json
{
  "level": 30,
  "time": 1709123456789,
  "msg": "User logged in",
  "userId": "123"
}
```

In development with `LOG_PRETTY=true`, logs are formatted for readability:

```
[12:34:56.789] INFO: User logged in
    userId: "123"
```
