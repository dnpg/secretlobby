# Enhanced Rate Limiting & Brute Force Protection

## Overview

This document describes the enhanced rate limiting system implemented to protect against brute force attacks and persistent bot behavior. The system uses progressive delays, violation tracking, and CAPTCHA integration to provide multi-layered security.

## Implementation Date

January 31, 2026

## Security Standards

This implementation follows industry best practices from:
- OWASP Foundation (Blocking Brute Force Attacks)
- OWASP API Security Top 10 2023
- Microsoft Security Research
- Academic research on exponential backoff

## Key Features

### 1. Progressive Rate Limiting (Exponential Backoff)

Instead of a fixed lockout period, the system implements **exponential backoff** that increases lockout duration for repeat offenders.

**Lockout Schedule:**
- **1st violation**: 15 minutes
- **2nd violation** (within 24 hours): 1 hour
- **3rd violation** (within 24 hours): 4 hours
- **4th violation** (within 24 hours): 24 hours
- **5+ violations** (within 7 days): 7-day IP block

**Formula:** `lockoutMinutes = min(15 × 4^(violationCount - 1), 1440)`

### 2. Violation Tracking

The system tracks rate limit violations in the database with:
- IP address
- Timestamp
- Target resource (lobby ID, login endpoint, etc.)
- Violation count
- Status (active, resolved, blocked)

### 3. CAPTCHA Integration

Cloudflare Turnstile CAPTCHA is triggered when:
- IP has 3+ violations in 24 hours
- IP has persistent retry patterns (requests exactly at reset time)
- IP is from known proxy/VPN services (future enhancement)

### 4. IP Blocking

Automatic IP blocking occurs when:
- 5+ violations within 7 days → 7-day block
- 10+ violations within 30 days → Permanent block (requires admin review)

### 5. Monitoring & Alerts

The system logs and monitors:
- All rate limit violations
- Progressive lockout triggers
- CAPTCHA challenges issued
- IP blocks applied
- Successful logins after violations (potential breach)

## Protected Endpoints

### Current Rate Limits

| Endpoint | Base Limit | Window | Progressive Lockout |
|----------|------------|--------|---------------------|
| **Login** | 5 attempts | 15 min | ✅ Yes |
| **Signup** | 3 attempts | 1 hour | ✅ Yes |
| **Password Reset** | 3 attempts | 1 hour | ✅ Yes |
| **OAuth** | 10 attempts | 15 min | ✅ Yes |
| **Email Verification** | 5 attempts | 1 hour | ✅ Yes |
| **Lobby Password** | 5 attempts | 15 min | ✅ Yes |

## Database Schema

### RateLimitViolation Table

```prisma
model RateLimitViolation {
  id              String   @id @default(cuid())
  ipAddress       String
  endpoint        String   // "login", "lobby-password", etc.
  resourceId      String?  // Lobby ID, account ID, etc.
  violationCount  Int      @default(1)
  firstViolation  DateTime @default(now())
  lastViolation   DateTime @updatedAt
  lockoutUntil    DateTime?
  status          ViolationStatus @default(ACTIVE)
  userAgent       String?
  metadata        Json?

  @@index([ipAddress, endpoint])
  @@index([status, lockoutUntil])
  @@index([lastViolation])
}

enum ViolationStatus {
  ACTIVE      // Currently tracking violations
  RESOLVED    // User succeeded after violations
  BLOCKED     // IP is blocked
  EXPIRED     // Violations aged out
}
```

## Implementation Details

### 1. Violation Recording

When a rate limit is exceeded:

```typescript
async function recordViolation(
  ip: string,
  endpoint: string,
  resourceId?: string
): Promise<void> {
  const violation = await prisma.rateLimitViolation.findFirst({
    where: {
      ipAddress: ip,
      endpoint,
      resourceId,
      lastViolation: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }
  });

  if (violation) {
    await prisma.rateLimitViolation.update({
      where: { id: violation.id },
      data: {
        violationCount: violation.violationCount + 1,
        lastViolation: new Date(),
        lockoutUntil: calculateLockoutTime(violation.violationCount + 1)
      }
    });
  } else {
    await prisma.rateLimitViolation.create({
      data: {
        ipAddress: ip,
        endpoint,
        resourceId,
        violationCount: 1,
        lockoutUntil: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
      }
    });
  }
}
```

### 2. Progressive Lockout Calculation

```typescript
function calculateLockoutTime(violationCount: number): Date {
  // Exponential backoff: 15min, 1hr, 4hr, 24hr
  const minutes = Math.min(15 * Math.pow(4, violationCount - 1), 1440);
  return new Date(Date.now() + minutes * 60 * 1000);
}
```

### 3. Enhanced Rate Limit Check

```typescript
async function checkEnhancedRateLimit(
  request: Request,
  config: RateLimitConfig,
  resourceId?: string
): Promise<EnhancedRateLimitResult> {
  const ip = getClientIp(request);

  // Check for active IP block
  const block = await checkIPBlock(ip);
  if (block) {
    return {
      allowed: false,
      reason: "IP_BLOCKED",
      blockUntil: block.expiresAt,
      requireCaptcha: true
    };
  }

  // Check violation history
  const violations = await getRecentViolations(ip, config.keyPrefix, resourceId);

  // Apply progressive lockout
  if (violations.length >= 3) {
    return {
      allowed: false,
      reason: "PROGRESSIVE_LOCKOUT",
      resetInSeconds: calculateResetTime(violations),
      requireCaptcha: true
    };
  }

  // Standard rate limit check
  const standardResult = checkRateLimit(request, config);

  if (!standardResult.allowed) {
    // Record violation
    await recordViolation(ip, config.keyPrefix, resourceId);
  }

  return standardResult;
}
```

### 4. CAPTCHA Verification

```typescript
async function verifyCaptcha(token: string): Promise<boolean> {
  const response = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: token
      })
    }
  );

  const data = await response.json();
  return data.success === true;
}
```

## Monitoring & Analytics

### Super Admin Dashboard

The super admin interface displays:

**Violation Statistics:**
- Total violations (last 24 hours, 7 days, 30 days)
- Top violating IPs
- Most targeted resources
- CAPTCHA challenge rate
- Block rate

**User Behavior Analytics:**
- Failed login attempts per user
- Successful logins after violations
- Time between attempts
- Geographic patterns (if IP geolocation enabled)

**Active Blocks:**
- Currently blocked IPs
- Block reason
- Block expiration
- Unblock capability

### Alert Triggers

Alerts are generated for:
- **High**: 10+ violations from single IP in 1 hour
- **Critical**: Distributed attack (50+ violations from different IPs)
- **Suspicious**: Successful login after 5+ failed attempts
- **Security**: Password successfully guessed after violations

## Performance Considerations

### Database Optimization

**Indexes:**
- `(ipAddress, endpoint)` - Fast violation lookups
- `(status, lockoutUntil)` - Efficient block checks
- `(lastViolation)` - Quick aging queries

**Cleanup:**
- Violations older than 30 days are archived/deleted
- Expired blocks are cleaned up daily
- Status updated from ACTIVE to EXPIRED automatically

### Caching

- Recent violations cached in Redis (if available)
- IP blocks cached for 5 minutes
- CAPTCHA verification results cached for 1 hour

## Security Benefits

### Attack Prevention

1. **Simple Brute Force**: Stopped by base rate limits (5 attempts / 15 min)
2. **Persistent Bots**: Stopped by progressive delays (exponential backoff)
3. **Distributed Attacks**: Mitigated by CAPTCHA and monitoring
4. **Credential Stuffing**: Slowed by rate limits + CAPTCHA
5. **Low-and-Slow Attacks**: Detected by violation tracking over time

### OWASP Compliance

✅ **API Security Top 10 2023**: Addresses "Unrestricted Resource Consumption"
✅ **Broken Authentication**: Multi-layered defense against account compromise
✅ **Security Logging**: Comprehensive audit trail of authentication attempts
✅ **Rate Limiting**: Tailored limits based on endpoint sensitivity

## User Experience Impact

### Legitimate Users

**Minimal Impact:**
- 5 attempts is sufficient for typos/forgotten passwords
- Clear error messages with exact retry times
- Progressive delays only affect repeat violators
- CAPTCHA only shown to suspicious traffic

**Error Messages:**
- 1st lockout: "Too many attempts. Try again in 15 minutes."
- 2nd lockout: "Too many attempts. Try again in 1 hour."
- 3rd+ lockout: "Suspicious activity detected. Please complete CAPTCHA."
- Blocked: "Access temporarily restricted. Contact support if this is an error."

### Attackers

**Effective Deterrence:**
- Base attack: 5 attempts every 15 minutes = ~13,140 attempts/month
- With progressive delays: ~100 attempts/month
- With CAPTCHA: Human intervention required
- With IP blocking: Attack completely halted

**Work Factor Increase:**
- Simple script: Days → Years
- Bot network: Requires CAPTCHA solving
- Persistent attacker: IP rotation + human intervention

## Configuration

### Environment Variables

```bash
# CAPTCHA (Cloudflare Turnstile)
TURNSTILE_SITE_KEY=your-site-key
TURNSTILE_SECRET_KEY=your-secret-key

# Rate Limiting
RATE_LIMIT_REDIS_URL=redis://localhost:6379  # Optional, for distributed systems

# Monitoring
SECURITY_ALERT_EMAIL=security@secretlobby.io
ENABLE_VIOLATION_ALERTS=true
```

### Feature Flags

```typescript
const RATE_LIMIT_FEATURES = {
  PROGRESSIVE_DELAYS: true,
  CAPTCHA_ON_VIOLATIONS: true,
  IP_BLOCKING: true,
  VIOLATION_TRACKING: true,
  REDIS_STORAGE: false, // Set to true when scaling
};
```

## Future Enhancements

### Planned Improvements

1. **Device Fingerprinting**: Track beyond IP (browser, TLS fingerprints)
2. **Behavioral Analysis**: ML-based anomaly detection
3. **Geographic Blocking**: Block regions with high attack rates
4. **Honeypot Passwords**: Fake passwords that trigger instant blocks
5. **Risk Scoring**: Combine multiple signals for adaptive security
6. **Proxy Detection**: Identify and handle proxy/VPN traffic differently

### Integration Opportunities

- **Cloudflare Access**: Leverage Cloudflare's bot detection
- **MaxMind GeoIP**: Add geographic context to violations
- **Sentry**: Send security events to Sentry for alerting
- **DataDog**: Advanced analytics and dashboards

## Migration Guide

### Database Migration

```bash
# Generate migration
DATABASE_URL="postgresql://..." pnpm db:migrate:create add_rate_limit_violations

# Apply migration
DATABASE_URL="postgresql://..." pnpm db:migrate:deploy
```

### Gradual Rollout

1. **Phase 1**: Enable violation tracking (monitoring only)
2. **Phase 2**: Enable progressive delays
3. **Phase 3**: Enable CAPTCHA integration
4. **Phase 4**: Enable IP blocking
5. **Phase 5**: Enable alerts and monitoring

## Testing

### Test Scenarios

1. **Normal User**: Should not be affected
2. **Typo User**: Should get 5 attempts, succeed
3. **Forgot Password**: Should get helpful error after 5 attempts
4. **Bot (Simple)**: Gets blocked after 15 minutes
5. **Bot (Persistent)**: Gets progressive delays, CAPTCHA, then blocked
6. **Bot (Distributed)**: All IPs get CAPTCHA challenges

### Load Testing

- Verify database performance under high violation load
- Test Redis caching if enabled
- Ensure cleanup jobs run efficiently
- Monitor memory usage of violation tracking

## Support & Troubleshooting

### Common Issues

**"I'm locked out but I'm a real user":**
- Violations expire after 24 hours
- Contact support to manually clear violations
- Super admin can unblock IPs

**"CAPTCHA keeps appearing":**
- Check if IP is shared (VPN, corporate network)
- Verify violation history in super admin
- May need to whitelist IP

**"Rate limit seems too strict":**
- Review violation logs
- Adjust base limits if needed
- Consider increasing attempts for specific endpoints

### Admin Tools

**Clear Violations:**
```typescript
await prisma.rateLimitViolation.deleteMany({
  where: { ipAddress: "192.168.1.1" }
});
```

**Unblock IP:**
```typescript
await prisma.rateLimitViolation.updateMany({
  where: { ipAddress: "192.168.1.1", status: "BLOCKED" },
  data: { status: "RESOLVED" }
});
```

## References

- [OWASP: Blocking Brute Force Attacks](https://owasp.org/www-community/controls/Blocking_Brute_Force_Attacks)
- [OWASP: Credential Stuffing Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Credential_Stuffing_Prevention_Cheat_Sheet.html)
- [OWASP API Security Top 10 2023](https://owasp.org/API-Security/editions/2023/)
- [Exponential Backoff Best Practices](https://betterstack.com/community/guides/monitoring/exponential-backoff/)
- [Cloudflare Turnstile Documentation](https://developers.cloudflare.com/turnstile/)

---

**Document Version**: 1.0
**Last Updated**: January 31, 2026
**Owner**: Security Team
**Review Schedule**: Quarterly
