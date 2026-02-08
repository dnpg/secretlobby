---
sidebar_position: 2
slug: /packages/auth
---

# Authentication

The auth package provides authentication, session management, and security utilities.

## Overview

- **Package**: `@secretlobby/auth`
- **Technologies**: Arctic (OAuth), bcryptjs, iron-session, Redis, Zod

## Features

- Session management with iron-session
- Password hashing with bcryptjs
- OAuth integration (Arctic)
- Email verification
- Rate limiting (standard and enhanced)
- CAPTCHA support
- CSRF protection

## Usage

### Session Management

```typescript
import { getSession, requireAuth } from '@secretlobby/auth/session.server';

// Get current session
export async function loader({ request }: LoaderFunctionArgs) {
  const session = await getSession(request);
  return { user: session.user };
}

// Require authentication
export async function loader({ request }: LoaderFunctionArgs) {
  const session = await requireAuth(request);
  // User is guaranteed to be authenticated
  return { user: session.user };
}
```

### Password Handling

```typescript
import { hashPassword, verifyPassword } from '@secretlobby/auth/password.server';

// Hash a password
const hash = await hashPassword('user-password');

// Verify a password
const isValid = await verifyPassword('user-password', hash);
```

### OAuth Integration

```typescript
import { getOAuthClient, handleOAuthCallback } from '@secretlobby/auth/oauth.server';

// Get OAuth client for a provider
const client = getOAuthClient('google');

// Handle OAuth callback
const user = await handleOAuthCallback(request, 'google');
```

### Rate Limiting

```typescript
import { rateLimit, enhancedRateLimit } from '@secretlobby/auth/rate-limit.server';

// Basic rate limiting
await rateLimit(request, {
  key: 'login',
  limit: 5,
  window: 60, // seconds
});

// Enhanced rate limiting with Redis
await enhancedRateLimit(request, {
  key: 'api',
  limit: 100,
  window: 60,
});
```

### Email Verification

```typescript
import {
  generateVerificationToken,
  verifyEmailToken
} from '@secretlobby/auth/verification.server';

// Generate token
const token = await generateVerificationToken(email);

// Verify token
const isValid = await verifyEmailToken(token, email);
```

### CAPTCHA

```typescript
import { verifyCaptcha } from '@secretlobby/auth/captcha.server';

// Verify CAPTCHA response
const isValid = await verifyCaptcha(captchaResponse);
```

### CSRF Protection

```typescript
import { generateCsrfToken, verifyCsrfToken } from '@secretlobby/auth/csrf.server';

// Generate CSRF token
const token = generateCsrfToken(session);

// Verify CSRF token
const isValid = verifyCsrfToken(token, session);
```

## Configuration

Configure authentication via environment variables:

```bash
# Session
SESSION_SECRET=your-secret-key

# OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Redis (for rate limiting)
REDIS_URL=redis://localhost:6379

# CAPTCHA
CAPTCHA_SECRET_KEY=...
```
