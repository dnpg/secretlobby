# Rate Limiting Implementation

## Summary

Implemented comprehensive rate limiting for all authentication endpoints to prevent brute force attacks, credential stuffing, and denial-of-service (DoS) attempts. This critical security feature protects sensitive endpoints while maintaining a smooth user experience for legitimate users.

## Changes Made

### 1. Created Rate Limiting Utility (`packages/auth/src/rate-limit.server.ts`)

**Location:** `packages/auth/src/rate-limit.server.ts`

Created a flexible rate limiting system with:
- **In-memory store** for tracking request counts (upgradable to Redis for production)
- **IP-based tracking** with support for proxy headers (X-Forwarded-For, X-Real-IP, CF-Connecting-IP)
- **Custom key support** for email-based or user-based rate limiting
- **Automatic cleanup** of expired entries every 5 minutes
- **Configurable limits** per endpoint type
- **Rate limit headers** (X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset)
- **429 Too Many Requests** responses with retry-after information

### 2. Predefined Rate Limit Configurations

| Endpoint | Max Attempts | Time Window | Purpose |
|----------|-------------|-------------|---------|
| **Login** | 5 | 15 minutes | Prevent brute force password attacks |
| **Signup** | 3 | 1 hour | Prevent mass account creation |
| **Password Reset** | 3 | 1 hour | Prevent reset abuse and email flooding |
| **OAuth** | 10 | 15 minutes | Prevent OAuth abuse |
| **Email Verification** | 5 | 1 hour | Prevent verification spam |

### 3. Applied Rate Limiting to Authentication Endpoints

**Files Updated: 4 route files**

#### Login Endpoint (`apps/console/app/routes/login.tsx`)
- Rate limit checked before authentication attempt
- Limit reset on successful login
- Returns 429 when limit exceeded

#### Signup Endpoint (`apps/console/app/routes/signup.tsx`)
- Rate limit checked before account creation
- Limit reset on successful signup
- Prevents automated account creation

#### Password Reset (`apps/console/app/routes/forgot-password.tsx`)
- Rate limit prevents email flooding
- 3 requests per hour per IP
- Always returns success (prevents email enumeration)

#### OAuth Callback (`apps/console/app/routes/auth.google.callback.tsx`)
- Rate limit prevents OAuth abuse
- 10 attempts per 15 minutes
- Limit reset on successful authentication

### 4. Testing

**Coverage:** 18 comprehensive tests
- Rate limit enforcement and tracking
- Window expiration and reset
- Multiple IP handling
- Custom key usage
- Predefined configuration validation
- Headers and response formatting
- Integration scenarios (login flows)
- Store cleanup verification

**Test Results:**
```
Test Files  6 passed (6)
Tests       182 passed (182)
  - Existing: 164 tests
  - New rate limiting: 18 tests
Duration    8.07s
```

## Technical Details

### How It Works

1. **Request arrives** at an authentication endpoint
2. **Rate limit check** extracts client IP (or custom key) and checks against limit
3. **Store lookup** finds existing record or creates new one
4. **Count increment** increases attempt counter
5. **Limit comparison** determines if request should be allowed
6. **Response** either processes request or returns 429

### In-Memory Store

```typescript
interface RateLimitRecord {
  count: number;      // Number of attempts
  resetAt: number;    // Timestamp when limit resets
}
```

**Features:**
- Automatic cleanup every 5 minutes
- Expired entries removed automatically on access
- Tracks by key: `{prefix}:{identifier}`
- Example: `rl:login:192.168.1.1`

### IP Detection Priority

1. `X-Forwarded-For` header (first IP if multiple)
2. `X-Real-IP` header
3. `CF-Connecting-IP` header (Cloudflare)
4. Fallback to "unknown"

### Rate Limit Response

**HTTP 429 Response:**
```json
{
  "error": "Too many requests",
  "message": "Rate limit exceeded. Try again in 300 seconds.",
  "retryAfter": 300
}
```

**Headers:**
```
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Retry-After: 300
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 300
```

## Usage Examples

### Basic Usage (Login)

```typescript
import { checkRateLimit, RATE_LIMIT_CONFIGS, createRateLimitResponse, resetRateLimit } from "@secretlobby/auth/rate-limit";

export async function action({ request }: Route.ActionArgs) {
  // Check rate limit
  const rateLimitResult = checkRateLimit(request, RATE_LIMIT_CONFIGS.LOGIN);

  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult);
  }

  // Process login...
  const result = await authenticateWithPassword(email, password);

  if (result.success) {
    // Reset limit on successful login
    resetRateLimit(request, RATE_LIMIT_CONFIGS.LOGIN);
  }

  return createSessionResponse(/* ... */);
}
```

### Custom Key (Email-based)

```typescript
// Rate limit by email instead of IP
const rateLimitResult = checkRateLimit(
  request,
  RATE_LIMIT_CONFIGS.PASSWORD_RESET,
  email.toLowerCase() // Custom key
);
```

### Custom Configuration

```typescript
const customConfig: RateLimitConfig = {
  maxAttempts: 10,
  windowMs: 5 * 60 * 1000, // 5 minutes
  keyPrefix: "rl:custom",
};

const result = checkRateLimit(request, customConfig);
```

## Security Benefits

### 1. **Brute Force Protection**
- Login attempts limited to 5 per 15 minutes
- Makes password guessing impractical
- Prevents credential stuffing attacks

### 2. **DoS Prevention**
- Limits resource consumption from automated attacks
- Prevents mass account creation
- Protects email sending capacity

### 3. **Enumeration Prevention**
- Password reset always returns success
- Attackers can't determine valid emails
- Limited attempts prevent mass enumeration

### 4. **OAuth Abuse Prevention**
- Prevents automated OAuth attacks
- Limits state token generation
- Protects against OAuth implementation flaws

## User Experience

### Legitimate Users
- **5 login attempts** - enough for typos and forgotten passwords
- **Clear error messages** - tells user when to retry
- **Automatic reset** on success - no lingering restrictions
- **Reasonable windows** - 15-60 minutes is acceptable

### Attackers
- **Effectively blocked** after a few attempts
- **Must wait** for window to expire
- **Can't bypass** with new sessions (IP-based)
- **Rate limited** across multiple endpoints

## Production Considerations

### Current Implementation (In-Memory)
- ✅ **Pros:** Simple, fast, no external dependencies
- ❌ **Cons:** Not shared across servers, resets on restart

### Redis Implementation (Recommended for Production)

```typescript
// Future improvement: packages/auth/src/rate-limit-redis.server.ts
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL);

class RedisRateLimitStore {
  async get(key: string): Promise<RateLimitRecord | undefined> {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : undefined;
  }

  async set(key: string, record: RateLimitRecord): Promise<void> {
    const ttl = Math.ceil((record.resetAt - Date.now()) / 1000);
    await redis.setex(key, ttl, JSON.stringify(record));
  }
}
```

**Benefits:**
- Shared across all servers
- Persists across restarts
- Supports distributed deployments
- Better scalability

### Monitoring Recommendations

1. **Track Rate Limit Hits**
   - Monitor 429 responses
   - Alert on unusual patterns
   - Identify potential attacks

2. **Store Metrics**
   - Size of rate limit store
   - Most limited endpoints
   - IP addresses hitting limits frequently

3. **Adjust Limits**
   - Review logs to tune limits
   - Balance security vs usability
   - Consider user feedback

## Migration Guide

### Adding Rate Limiting to New Endpoints

1. **Import rate limiting functions:**
   ```typescript
   import { checkRateLimit, createRateLimitResponse, RATE_LIMIT_CONFIGS, resetRateLimit } from "@secretlobby/auth/rate-limit";
   ```

2. **Add check at start of action/loader:**
   ```typescript
   const rateLimitResult = checkRateLimit(request, RATE_LIMIT_CONFIGS.LOGIN);
   if (!rateLimitResult.allowed) {
     return createRateLimitResponse(rateLimitResult);
   }
   ```

3. **Reset on success (optional):**
   ```typescript
   if (operationSuccessful) {
     resetRateLimit(request, RATE_LIMIT_CONFIGS.LOGIN);
   }
   ```

### Testing Rate Limits

```typescript
// Test helper to make multiple requests
async function attemptLogin(times: number) {
  for (let i = 0; i < times; i++) {
    const response = await fetch("/login", {
      method: "POST",
      body: formData,
    });

    if (response.status === 429) {
      const data = await response.json();
      console.log(`Rate limited. Retry in ${data.retryAfter}s`);
      return;
    }
  }
}
```

## API Reference

### `checkRateLimit(request, config, customKey?)`

Check if a request should be rate limited.

**Parameters:**
- `request: Request` - The incoming request
- `config: RateLimitConfig` - Rate limit configuration
- `customKey?: string` - Optional custom key (instead of IP)

**Returns:** `RateLimitResult`
```typescript
{
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
  limit: number;
}
```

### `resetRateLimit(request, config, customKey?)`

Reset rate limit for a specific identifier (useful after successful operations).

**Parameters:**
- `request: Request` - The request
- `config: RateLimitConfig` - Rate limit configuration
- `customKey?: string` - Optional custom key

### `createRateLimitResponse(result)`

Create a standardized 429 response.

**Parameters:**
- `result: RateLimitResult` - Rate limit check result

**Returns:** `Response` (HTTP 429 with headers and JSON body)

### `getRateLimitHeaders(result)`

Get rate limit headers for including in custom responses.

**Parameters:**
- `result: RateLimitResult` - Rate limit check result

**Returns:** `Record<string, string>` - Headers object

## Configuration Reference

### `RATE_LIMIT_CONFIGS.LOGIN`
- Max Attempts: 5
- Window: 15 minutes
- Key Prefix: `rl:login`

### `RATE_LIMIT_CONFIGS.SIGNUP`
- Max Attempts: 3
- Window: 1 hour
- Key Prefix: `rl:signup`

### `RATE_LIMIT_CONFIGS.PASSWORD_RESET`
- Max Attempts: 3
- Window: 1 hour
- Key Prefix: `rl:password-reset`

### `RATE_LIMIT_CONFIGS.OAUTH`
- Max Attempts: 10
- Window: 15 minutes
- Key Prefix: `rl:oauth`

### `RATE_LIMIT_CONFIGS.EMAIL_VERIFICATION`
- Max Attempts: 5
- Window: 1 hour
- Key Prefix: `rl:email-verify`

## Files Modified

**Total:** 5 files created/modified

**New Files:**
- `packages/auth/src/rate-limit.server.ts` - Core implementation (360 lines)
- `packages/auth/src/__tests__/rate-limit.server.test.ts` - Tests (310 lines)

**Modified Files:**
- `packages/auth/package.json` - Added rate-limit export
- `apps/console/app/routes/login.tsx` - Added rate limiting
- `apps/console/app/routes/signup.tsx` - Added rate limiting
- `apps/console/app/routes/forgot-password.tsx` - Added rate limiting
- `apps/console/app/routes/auth.google.callback.tsx` - Added rate limiting

## Future Improvements

1. **Redis Integration**
   - Implement Redis-backed store for production
   - Share limits across multiple servers
   - Add Redis connection pooling

2. **Advanced Features**
   - IP whitelist/blacklist
   - CAPTCHA integration after threshold
   - Adaptive rate limiting based on behavior
   - Geographic rate limiting

3. **Monitoring**
   - Dashboard for rate limit metrics
   - Real-time alerts for attacks
   - Historical analysis of rate limit hits

4. **User Management**
   - Allow users to see their rate limit status
   - Provide appeals process for false positives
   - Admin tools to adjust limits per user

---

**Implementation Date:** January 31, 2026
**Status:** ✅ Complete
**Tests:** 18/18 passing
**Security Level:** HIGH
