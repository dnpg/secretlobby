# Rate Limiting Architecture

This document explains the rate limiting layers used across all apps.

## Overview

The system uses two rate limiting mechanisms:

| Layer | Storage | Scope | Persistence | Reset Method |
|-------|---------|-------|-------------|--------------|
| **Redis Rate Limit** | Redis | IP-based | Persistent with TTL | Auto-expire or manual clear |
| **User Account Lockout** | Database (`User` table) | User-based | Persistent | Password reset or lockout expiry |
| **Enhanced Progressive Limit** | Database (`RateLimitViolation` table) | IP-based | Persistent | Admin action or expiry |

---

## Layer 1: Redis + Database Rate Limit

**File:** `packages/auth/src/rate-limit.server.ts`

**Used by:** All apps (Console, Lobby, Super Admin)

This is the primary rate limiting mechanism. It uses a **two-tier approach**:

1. **Redis (Primary)**: Fast, distributed rate limiting with automatic TTL
2. **Database (Fallback)**: Uses `RateLimitViolation` table when Redis is unavailable

This ensures rate limiting **always works**, even without Redis.

### Configuration

These are **IP-based limits** to prevent bots/abuse. They're intentionally higher than user account lockouts to allow legitimate users who mistype emails, try different accounts, etc.

```typescript
RATE_LIMIT_CONFIGS = {
  LOGIN: {
    maxAttempts: 15,           // Higher - allows email typos
    windowMs: 15 * 60 * 1000,  // 15 minutes
    keyPrefix: "rl:login",
  },
  SIGNUP: {
    maxAttempts: 5,
    windowMs: 60 * 60 * 1000,  // 1 hour
    keyPrefix: "rl:signup",
  },
  PASSWORD_RESET: {
    maxAttempts: 5,
    windowMs: 60 * 60 * 1000,  // 1 hour
    keyPrefix: "rl:password-reset",
  },
  OAUTH: {
    maxAttempts: 15,
    windowMs: 15 * 60 * 1000,  // 15 minutes
    keyPrefix: "rl:oauth",
  },
  EMAIL_VERIFICATION: {
    maxAttempts: 5,
    windowMs: 60 * 60 * 1000,  // 1 hour
    keyPrefix: "rl:email-verify",
  },
  LOBBY_PASSWORD: {
    maxAttempts: 10,           // No user account, relies on progressive lockout
    windowMs: 15 * 60 * 1000,  // 15 minutes
    keyPrefix: "rl:lobby-password",
  },
}
```

### Why IP limits are higher than user limits

| Scenario | What happens |
|----------|--------------|
| User tries wrong email 5 times | Still has 10 more attempts to try correct email |
| User finds correct email, wrong password 3 times | **Account locked** (not IP) |
| Bot tries 15 different emails | IP blocked, progressive lockout escalates |
| Attacker uses many IPs on one account | **Account locked** after 3 attempts |

### Requirements

**Redis (Optional but Recommended)**:
```bash
# .env
REDIS_URL=redis://localhost:6379

# Production example (with password)
REDIS_URL=redis://:password@your-redis-host:6379
```

If `REDIS_URL` is not set or Redis is unavailable, the system automatically falls back to database-based rate limiting.

### Fallback Behavior

| Scenario | Behavior |
|----------|----------|
| Redis available | Uses Redis (fast, TTL-based cleanup) |
| Redis unavailable | Falls back to database (`RateLimitViolation` table) |
| Both unavailable | Allows request (fail-open) with error logged |

The debug endpoint shows which backend is active:
```bash
curl http://localhost:3001/api/debug/rate-limits
# Returns: { "backend": "redis" } or { "backend": "database" }
```

### Error Response

When limit is exceeded:
```json
{
  "error": "Too many requests",
  "message": "Rate limit exceeded. Try again in 900 seconds.",
  "retryAfter": 900
}
```

HTTP Status: `429 Too Many Requests`

Headers:
- `X-RateLimit-Limit`: Maximum attempts allowed
- `X-RateLimit-Remaining`: Attempts remaining
- `X-RateLimit-Reset`: Seconds until reset
- `Retry-After`: Seconds until client should retry

### Usage in Routes

```typescript
export async function action({ request }: Route.ActionArgs) {
  const { checkRateLimit, createRateLimitResponse, RATE_LIMIT_CONFIGS, resetRateLimit } =
    await import("@secretlobby/auth/rate-limit");

  // Check rate limit (async - requires await)
  const rateLimitResult = await checkRateLimit(request, RATE_LIMIT_CONFIGS.LOGIN);
  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult);
  }

  // ... authenticate user ...

  // On success, reset the rate limit
  await resetRateLimit(request, RATE_LIMIT_CONFIGS.LOGIN);
}
```

---

## Layer 2: User Account Lockout

**File:** `packages/auth/src/password.server.ts`

**Used by:** Console login, Super Admin login (password-based user auth)

This protects **individual user accounts** from password guessing attacks. It's separate from IP rate limiting because:

- IP limit: Prevents one IP from trying many emails (bot protection)
- Account lockout: Prevents many IPs from targeting one account (account protection)

Uses the `User` table fields:
- `failedLoginAttempts: Int`
- `lockedUntil: DateTime?`

### Configuration

```typescript
const MAX_LOGIN_ATTEMPTS = 3;      // Per account, not per IP
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
```

### Flow

1. User enters wrong password → `failedLoginAttempts` incremented
2. After 3 failed attempts → `lockedUntil` set to 15 minutes in future
3. During lockout → Login rejected immediately (password not checked)
4. After lockout expires → Counter resets on next attempt
5. On successful login → Both fields reset to 0/null

### Example Scenarios

| Scenario | IP Limit (15) | Account Lockout (3) |
|----------|---------------|---------------------|
| Wrong email 5 times, then correct email + right password | 10 remaining | Success (resets) |
| Correct email, wrong password 3 times | 12 remaining | **Account locked 15 min** |
| Wrong email 15 times | **IP blocked 15 min** | N/A (no account found) |

### Error Messages

```typescript
// Wrong password (attempts remaining)
{ error: "Invalid email or password" }

// Last attempt warning
{ error: "Invalid email or password. You have 1 attempt remaining before your account is locked." }

// Account locked
{ error: "Account locked. Try again in X minutes." }
```

---

## Layer 3: Enhanced Progressive Rate Limit

**File:** `packages/auth/src/enhanced-rate-limit.server.ts`

**Used by:** Lobby password protection only

Provides escalating lockout periods for persistent attackers, stored in the `RateLimitViolation` table.

### Progressive Lockout Schedule

| Violation # | Lockout Duration |
|-------------|------------------|
| 1st | 15 minutes |
| 2nd | 1 hour |
| 3rd | 4 hours |
| 4th | 24 hours |
| 5th-9th | 7 days |
| 10+ | **Permanent block** |

---

## Clearing Rate Limits

### Development

#### Option 1: Debug Endpoint (Console App)

```bash
# View current rate limits
curl http://localhost:3001/api/debug/rate-limits

# Clear all rate limits
curl -X POST http://localhost:3001/api/debug/rate-limits
```

#### Option 2: Redis CLI

```bash
# Connect to Redis
redis-cli

# View all rate limit keys
KEYS rl:*

# View specific key
GET rl:login:127.0.0.1

# Delete specific key
DEL rl:login:127.0.0.1

# Clear all rate limits (caution!)
KEYS rl:* | xargs redis-cli DEL
```

#### Option 3: Clear for Specific IP

```typescript
import { clearRateLimitsForIP } from "@secretlobby/auth/rate-limit";

await clearRateLimitsForIP("127.0.0.1");
```

### Production

#### Option 1: Redis CLI

```bash
# Connect to production Redis
redis-cli -h your-redis-host -p 6379 -a your-password

# View rate limits for specific IP
GET rl:login:1.2.3.4

# Clear rate limits for specific IP
DEL rl:login:1.2.3.4
DEL rl:signup:1.2.3.4
DEL rl:password-reset:1.2.3.4
DEL rl:oauth:1.2.3.4
DEL rl:email-verify:1.2.3.4
DEL rl:lobby-password:1.2.3.4
```

#### Option 2: Super Admin Dashboard

Use the Security section in the Super Admin dashboard to:
- View blocked IPs
- Unblock specific IPs
- Clear violations

#### Option 3: Programmatic (via API or Script)

```typescript
import { clearRateLimitsForIP, clearAllRateLimits } from "@secretlobby/auth/rate-limit";

// Clear for specific IP
await clearRateLimitsForIP("1.2.3.4");

// Clear all (use with caution!)
await clearAllRateLimits();
```

### Clearing User Account Lockouts

```sql
-- Clear lockout for specific user
UPDATE "User"
SET "failedLoginAttempts" = 0, "lockedUntil" = NULL
WHERE email = 'user@example.com';

-- Clear all lockouts (use with caution!)
UPDATE "User"
SET "failedLoginAttempts" = 0, "lockedUntil" = NULL
WHERE "lockedUntil" IS NOT NULL;
```

Or use Prisma Studio:
```bash
pnpm --filter db studio
```

### Clearing Progressive Violations

```sql
-- Mark violations as resolved for specific IP
UPDATE "RateLimitViolation"
SET status = 'RESOLVED'
WHERE "ipAddress" = '1.2.3.4';

-- Clear all active violations (use with caution!)
UPDATE "RateLimitViolation"
SET status = 'RESOLVED'
WHERE status = 'ACTIVE';
```

---

## Error Messages Quick Reference

| Error Message | Layer | Threshold | How to Fix |
|--------------|-------|-----------|------------|
| "Too many requests" | IP Rate Limit | 15 login attempts | Wait 15 min or try different network |
| "Account locked. Try again in X minutes." | User Lockout | 3 wrong passwords | Wait 15 min or reset password |
| "Invalid email or password. You have 1 attempt remaining..." | User Lockout | 2 wrong passwords | Use correct password |
| "Access temporarily blocked..." | Progressive | Repeated violations | Wait for lockout or contact admin |
| "Your access has been permanently blocked..." | Progressive | 10+ violations | Contact admin |

---

## Architecture Benefits

### Two-Tier Rate Limiting

1. **Redis (Primary)**:
   - Scalable across multiple server instances
   - Automatic TTL-based cleanup
   - Memory safe - no unbounded growth
   - Fast (sub-millisecond operations)

2. **Database (Fallback)**:
   - Works without Redis
   - Uses existing `RateLimitViolation` table
   - Persistent and queryable
   - Integrates with admin dashboard

### Multi-Layer Protection

1. **Redis/Database Layer**: Blocks high-volume attacks at IP level
2. **User Lockout**: Protects individual accounts from targeted attacks
3. **Progressive Lockout**: Escalates punishment for persistent attackers

---

## Monitoring

### Check Redis Connection

```typescript
import { isRateLimitingAvailable } from "@secretlobby/auth/rate-limit";

if (!isRateLimitingAvailable()) {
  // Rate limiting is disabled - alert!
}
```

### Get Rate Limit Status

```typescript
import { getRateLimitStatus } from "@secretlobby/auth/rate-limit";

const status = await getRateLimitStatus("1.2.3.4");
// Returns: { LOGIN: { count: 3, ttl: 500 }, SIGNUP: null, ... }
```

### Redis Memory Usage

```bash
redis-cli INFO memory
redis-cli DBSIZE
redis-cli KEYS rl:* | wc -l
```
