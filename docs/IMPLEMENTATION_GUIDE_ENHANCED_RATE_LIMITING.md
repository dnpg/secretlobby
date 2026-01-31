# Implementation Guide: Enhanced Rate Limiting

## Overview

This guide provides step-by-step instructions for implementing the enhanced rate limiting system across the Band-Blast platform.

## Prerequisites

- Database migration completed (RateLimitViolation table)
- Cloudflare Turnstile account (free tier available)
- Environment variables configured

## Step 1: Database Migration

### Generate Migration

```bash
cd /Users/diegopego/Sites/band-blast/packages/db
DATABASE_URL="postgresql://secretlobby:secretlobby_dev_password@localhost:5432/secretlobby" \
  pnpm db:migrate:create add_rate_limit_violations
```

### Apply Migration

```bash
DATABASE_URL="postgresql://secretlobby:secretlobby_dev_password@localhost:5432/secretlobby" \
  pnpm db:migrate:deploy
```

### Generate Prisma Client

```bash
DATABASE_URL="postgresql://secretlobby:secretlobby_dev_password@localhost:5432/secretlobby" \
  pnpm db:generate
```

## Step 2: Environment Configuration

Add to `.env`:

```bash
# Cloudflare Turnstile CAPTCHA
TURNSTILE_SITE_KEY=your-site-key-here
TURNSTILE_SECRET_KEY=your-secret-key-here

# Optional: Enable/disable features
ENABLE_PROGRESSIVE_RATE_LIMITING=true
ENABLE_CAPTCHA=true
ENABLE_IP_BLOCKING=true
```

### Get Cloudflare Turnstile Keys

1. Visit https://dash.cloudflare.com/
2. Navigate to Turnstile
3. Create a new site
4. Copy the Site Key and Secret Key

## Step 3: Update Lobby Password Route

**File:** `apps/lobby/app/routes/_index.tsx`

### Import Enhanced Rate Limiting

```typescript
// Add to imports at top of action function
const {
  checkIPBlock,
  recordViolation,
  resetViolations,
  shouldRequireCaptcha,
} = await import("@secretlobby/auth/enhanced-rate-limit");
const { verifyCaptcha } = await import("@secretlobby/auth/captcha");
```

### Update Action Function

```typescript
export async function action({ request }: Route.ActionArgs) {
  const { checkRateLimit, RATE_LIMIT_CONFIGS, resetRateLimit } = await import("@secretlobby/auth/rate-limit");
  const {
    checkIPBlock,
    recordViolation,
    resetViolations,
    shouldRequireCaptcha,
  } = await import("@secretlobby/auth/enhanced-rate-limit");
  const { verifyCaptcha, getCaptchaSiteKey } = await import("@secretlobby/auth/captcha");

  const ip = getClientIp(request);
  const formData = await request.formData();
  const password = formData.get("password") as string;
  const captchaToken = formData.get("cf-turnstile-response") as string;

  // Step 1: Check if IP is blocked
  const block = await checkIPBlock(ip, "lobby-password", lobbyId);
  if (block) {
    const minutes = Math.ceil(
      (block.lockoutUntil.getTime() - Date.now()) / 60000
    );
    return {
      error: `Access temporarily blocked due to multiple failed attempts. Try again in ${minutes} minutes.`,
      requireCaptcha: true,
      captchaSiteKey: getCaptchaSiteKey(),
    };
  }

  // Step 2: Check if CAPTCHA is required
  const requireCaptcha = await shouldRequireCaptcha(ip, "lobby-password");
  if (requireCaptcha) {
    if (!captchaToken) {
      return {
        error: "Please complete the CAPTCHA verification.",
        requireCaptcha: true,
        captchaSiteKey: getCaptchaSiteKey(),
      };
    }

    const captchaValid = await verifyCaptcha(captchaToken, ip);
    if (!captchaValid) {
      return {
        error: "CAPTCHA verification failed. Please try again.",
        requireCaptcha: true,
        captchaSiteKey: getCaptchaSiteKey(),
      };
    }
  }

  // Step 3: Standard rate limit check
  const rateLimitResult = checkRateLimit(request, RATE_LIMIT_CONFIGS.LOBBY_PASSWORD);
  if (!rateLimitResult.allowed) {
    // Record violation for progressive tracking
    await recordViolation(ip, "lobby-password", lobbyId, request.headers.get("user-agent") || undefined);

    const minutes = Math.ceil(rateLimitResult.resetInSeconds / 60);
    return {
      error: `Too many attempts. Try again in ${minutes} minutes.`,
      requireCaptcha: await shouldRequireCaptcha(ip, "lobby-password"),
      captchaSiteKey: getCaptchaSiteKey(),
    };
  }

  // Step 4: Verify password
  if (password !== correctPassword) {
    return { error: "Invalid password" };
  }

  // Step 5: Success - reset violations and rate limits
  resetRateLimit(request, RATE_LIMIT_CONFIGS.LOBBY_PASSWORD);
  await resetViolations(ip, "lobby-password", lobbyId);

  return createSessionResponse({ isAuthenticated: true, lobbyId }, request, "/");
}
```

### Update Loader to Pass CAPTCHA Key

```typescript
export async function loader({ request }: Route.LoaderArgs) {
  const { getCaptchaSiteKey } = await import("@secretlobby/auth/captcha");
  const { shouldRequireCaptcha } = await import("@secretlobby/auth/enhanced-rate-limit");

  const ip = getClientIp(request);

  return {
    // ... existing loader data
    captchaSiteKey: getCaptchaSiteKey(),
    requireCaptcha: await shouldRequireCaptcha(ip, "lobby-password"),
  };
}
```

## Step 4: Update Client-Side UI

### Add Cloudflare Turnstile Script

In the lobby page component, add the Turnstile widget where needed:

```typescript
// Add to component imports
import { useEffect, useRef } from "react";

function PasswordLoginForm() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const turnstileRef = useRef<HTMLDivElement>(null);

  // Load Turnstile script
  useEffect(() => {
    if (data.requireCaptcha || actionData?.requireCaptcha) {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);

      return () => {
        document.body.removeChild(script);
      };
    }
  }, [data.requireCaptcha, actionData?.requireCaptcha]);

  const showCaptcha = data.requireCaptcha || actionData?.requireCaptcha;

  return (
    <Form method="post">
      <input type="password" name="password" required />

      {showCaptcha && data.captchaSiteKey && (
        <div
          ref={turnstileRef}
          className="cf-turnstile"
          data-sitekey={data.captchaSiteKey}
          data-theme="dark"
        />
      )}

      <button type="submit">Login</button>
    </Form>
  );
}
```

## Step 5: Update Login Routes

Apply similar changes to:

- `apps/console/app/routes/login.tsx`
- `apps/console/app/routes/signup.tsx`
- `apps/console/app/routes/forgot-password.tsx`

### Example for Login Route

```typescript
export async function action({ request }: Route.ActionArgs) {
  const { createLogger, formatError } = await import("@secretlobby/logger/server");
  const { checkRateLimit, RATE_LIMIT_CONFIGS, resetRateLimit } = await import("@secretlobby/auth/rate-limit");
  const {
    checkIPBlock,
    recordViolation,
    resetViolations,
    shouldRequireCaptcha,
  } = await import("@secretlobby/auth/enhanced-rate-limit");
  const { verifyCaptcha, getCaptchaSiteKey } = await import("@secretlobby/auth/captcha");

  const logger = createLogger({ service: "console:login" });
  const ip = getClientIp(request);

  // Check IP block
  const block = await checkIPBlock(ip, "login");
  if (block) {
    const minutes = Math.ceil((block.lockoutUntil.getTime() - Date.now()) / 60000);
    return {
      error: `Too many failed attempts. Account locked for ${minutes} minutes.`,
      requireCaptcha: true,
      captchaSiteKey: getCaptchaSiteKey(),
    };
  }

  // Check CAPTCHA if required
  const requireCaptcha = await shouldRequireCaptcha(ip, "login");
  if (requireCaptcha) {
    const formData = await request.formData();
    const captchaToken = formData.get("cf-turnstile-response") as string;

    if (!captchaToken || !(await verifyCaptcha(captchaToken, ip))) {
      return {
        error: "CAPTCHA verification failed.",
        requireCaptcha: true,
        captchaSiteKey: getCaptchaSiteKey(),
      };
    }
  }

  // Standard rate limit
  const rateLimitResult = checkRateLimit(request, RATE_LIMIT_CONFIGS.LOGIN);
  if (!rateLimitResult.allowed) {
    await recordViolation(ip, "login", undefined, request.headers.get("user-agent") || undefined);
    return createRateLimitResponse(rateLimitResult);
  }

  // Authenticate...
  const result = await authenticateWithPassword(email, password);

  if (result.success) {
    resetRateLimit(request, RATE_LIMIT_CONFIGS.LOGIN);
    await resetViolations(ip, "login");
    return createSessionResponse(/* ... */);
  }

  return { error: result.error };
}
```

## Step 6: Add Cleanup Cron Job

### Create Cleanup Script

**File:** `packages/db/src/cron/cleanup-violations.ts`

```typescript
import { cleanupExpiredViolations } from "@secretlobby/auth/enhanced-rate-limit";
import { createLogger } from "@secretlobby/logger";

const logger = createLogger({ service: "cron:cleanup-violations" });

async function main() {
  logger.info("Starting violation cleanup");
  const count = await cleanupExpiredViolations();
  logger.info({ count }, "Violation cleanup complete");
}

main()
  .catch((error) => {
    logger.error({ error }, "Violation cleanup failed");
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
```

### Add to package.json Scripts

```json
{
  "scripts": {
    "cleanup:violations": "tsx src/cron/cleanup-violations.ts"
  }
}
```

### Setup Cron (Production)

Add to your cron scheduler (or use a service like GitHub Actions):

```cron
# Run daily at 2 AM
0 2 * * * cd /app && pnpm --filter @secretlobby/db cleanup:violations
```

## Step 7: Super Admin Dashboard Integration

See separate section below for super admin updates.

## Step 8: Testing

### Test Scenarios

1. **Normal user (< 5 attempts)**
   - Should login successfully without CAPTCHA

2. **User with typos (5-10 attempts)**
   - Gets locked out for 15 minutes
   - No CAPTCHA initially

3. **Persistent attacker (10+ attempts over hours)**
   - First lockout: 15 minutes
   - Second lockout: 1 hour
   - Third lockout: 4 hours + CAPTCHA required
   - Fourth lockout: 24 hours + IP marked as BLOCKED

4. **Bot with perfect timing**
   - Attempts exactly every 15 minutes
   - Triggers progressive lockout
   - Eventually requires CAPTCHA
   - Gets blocked after 5 violations

### Manual Testing

```bash
# Test rate limit (should fail after 5 attempts)
for i in {1..10}; do
  curl -X POST http://localhost:3000/lobby/password \
    -d "password=wrong" \
    -H "X-Forwarded-For: 192.168.1.100"
  echo "Attempt $i"
  sleep 1
done

# Check violations in database
psql -d secretlobby -c "SELECT * FROM \"RateLimitViolation\" WHERE \"ipAddress\" = '192.168.1.100';"
```

## Rollout Strategy

### Phase 1: Monitoring Only (Week 1)
- Enable violation tracking
- Log all events
- Don't enforce lockouts yet
- Review patterns

### Phase 2: Progressive Delays (Week 2)
- Enable progressive lockouts
- Monitor user complaints
- Adjust timings if needed

### Phase 3: CAPTCHA (Week 3)
- Enable CAPTCHA for 3+ violations
- Test user experience
- Monitor false positives

### Phase 4: IP Blocking (Week 4)
- Enable IP blocking for 5+ violations
- Set up alerts
- Create unblock procedure

### Phase 5: Full Production (Week 5)
- All features enabled
- Monitoring dashboard active
- Support team trained

## Monitoring & Alerts

### Key Metrics to Track

1. **Total Violations** (last 24 hours)
2. **Active Lockouts** (currently locked out)
3. **Blocked IPs** (permanently blocked)
4. **CAPTCHA Challenge Rate** (% of requests requiring CAPTCHA)
5. **False Positive Rate** (legitimate users getting blocked)

### Alert Thresholds

- **Warning**: 50+ violations in 1 hour
- **Critical**: 200+ violations in 1 hour (potential attack)
- **Security**: Successful login after 5+ violations (potential breach)

## Troubleshooting

### User Reports "I'm Locked Out"

1. Check violations in super admin
2. Verify IP address
3. Check violation count and lockout time
4. If legitimate user:
   ```sql
   UPDATE "RateLimitViolation"
   SET status = 'RESOLVED'
   WHERE "ipAddress" = '...' AND endpoint = '...';
   ```

### CAPTCHA Not Showing

1. Verify `TURNSTILE_SITE_KEY` in env
2. Check browser console for script errors
3. Verify Cloudflare Turnstile domain whitelist

### Too Many False Positives

1. Review violation patterns
2. Consider increasing base limits
3. Adjust progressive multiplier (currently 4x)
4. Add IP whitelist for corporate networks

## Performance Considerations

### Database Load

- Indexes on `(ipAddress, endpoint, resourceId)`
- Cleanup job runs daily (not real-time)
- Violations cached in Redis (optional)

### Expected Queries Per Request

- Normal: 0 queries (no violations)
- Rate limited: 1-2 queries (check + record)
- Blocked IP: 1 query (check only)

### Scaling Recommendations

- **< 10K requests/day**: In-memory + PostgreSQL (current setup)
- **10K-100K requests/day**: Add Redis caching
- **> 100K requests/day**: Dedicated rate limiting service

## Security Considerations

### Privacy

- IP addresses are stored temporarily
- No personal data in violations table
- GDPR: Include in data export/deletion

### Attack Vectors

- **IP Rotation**: Bot uses many IPs → CAPTCHA stops this
- **Distributed Attack**: Many IPs → Monitoring detects pattern
- **Slow Attack**: 1 attempt every 16 minutes → Progressive delays catch this
- **CAPTCHA Bypass**: Using solving services → Rate limit still applies

## Support Procedures

### User Locked Out

1. Verify identity
2. Check violation history
3. Clear violations if legitimate
4. Add to whitelist if corporate IP

### Suspected Attack

1. Review top violating IPs
2. Check geographic patterns
3. Enable CAPTCHA site-wide if needed
4. Block IP ranges if coordinated

### Performance Issues

1. Check violation table size
2. Run cleanup manually if needed
3. Add database indexes if slow
4. Consider Redis caching

## Next Steps

After implementation:

1. **Week 1**: Monitor violation patterns
2. **Week 2**: Review and adjust thresholds
3. **Week 3**: Add geographic analysis
4. **Week 4**: Implement IP reputation scoring
5. **Month 2**: Add ML-based anomaly detection

---

**Last Updated:** January 31, 2026
**Version:** 1.0
