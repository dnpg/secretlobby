# CSRF Protection Implementation

## Overview

Cross-Site Request Forgery (CSRF) protection has been implemented across the Band-Blast platform to prevent unauthorized actions from being performed on behalf of authenticated users.

## What is CSRF?

CSRF is an attack that tricks a user's browser into performing unwanted actions on a web application where the user is authenticated. For example:

1. User logs into `console.secretlobby.io`
2. User visits malicious site `evil.com`
3. `evil.com` makes a hidden POST request to `console.secretlobby.io/settings` to change user settings
4. Without CSRF protection, this request would succeed because the user's session cookie is automatically sent

## How Our Protection Works

We use a **synchronizer token pattern** with the following characteristics:

### 1. Token Generation

- Each user session gets a unique CSRF token
- Token format: `{randomValue}.{hmac}`
  - `randomValue`: 64 hex characters (32 random bytes)
  - `hmac`: SHA-256 HMAC signature of randomValue using SECRET
- Tokens are stored in the encrypted session cookie
- Tokens are regenerated if not present in session

### 2. Token Validation

Protected requests (POST, PUT, PATCH, DELETE) must include the CSRF token in:

**Option 1: Form data** (traditional forms)
```html
<form method="POST" action="/settings">
  <input type="hidden" name="_csrf" value="{csrfToken}" />
  <!-- other form fields -->
</form>
```

**Option 2: HTTP Header** (AJAX/API requests)
```javascript
fetch('/api/endpoint', {
  method: 'POST',
  headers: {
    'X-CSRF-Token': csrfToken,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(data),
});
```

**Option 3: JSON body** (API requests)
```javascript
fetch('/api/endpoint', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ _csrf: csrfToken, ...data }),
});
```

### 3. Verification Process

1. Extract token from request (form data, header, or JSON body)
2. Validate token format (must be `{randomValue}.{hmac}`)
3. Verify HMAC signature using server secret
4. Compare token with session token (must match exactly)
5. If any check fails → 403 Forbidden

## Implementation Guide

### Server-Side (Routes)

#### For Actions (POST/PUT/DELETE)

```typescript
// apps/console/app/routes/settings.tsx
import { getSession, getCsrfToken } from "@secretlobby/auth";
import { csrfProtect } from "@secretlobby/auth/csrf";
import type { Route } from "./+types/settings";

export async function loader({ request }: Route.LoaderArgs) {
  const csrfToken = await getCsrfToken(request);

  return {
    csrfToken,
    // ... other loader data
  };
}

export async function action({ request }: Route.ActionArgs) {
  // Verify CSRF token before processing (uses HMAC validation - no session needed)
  await csrfProtect(request);

  // Process the form submission
  const formData = await request.formData();
  // ... handle action
}
```

### Client-Side (Forms)

#### React Router Form Component

```typescript
import { Form, useLoaderData } from "react-router";

export default function SettingsPage() {
  const { csrfToken } = useLoaderData<typeof loader>();

  return (
    <Form method="POST">
      <input type="hidden" name="_csrf" value={csrfToken} />

      <input type="text" name="username" />
      <button type="submit">Save</button>
    </Form>
  );
}
```

#### Manual Form Submission

```typescript
import { useFetcher, useLoaderData } from "react-router";

export default function SettingsPage() {
  const { csrfToken } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    formData.append('_csrf', csrfToken);
    fetcher.submit(formData, { method: 'POST' });
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* form fields */}
    </form>
  );
}
```

#### AJAX/Fetch Requests

```typescript
import { useLoaderData } from "react-router";

export default function SettingsPage() {
  const { csrfToken } = useLoaderData<typeof loader>();

  const updateSettings = async (data: Settings) => {
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: {
        'X-CSRF-Token': csrfToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error('Failed to update settings');
    }

    return response.json();
  };

  // ... rest of component
}
```

## Protected Routes

### Console App (`apps/console`)

CSRF protection is required for all routes with actions:

- **Authentication**
  - `/login` - Login form
  - `/signup` - Registration form
  - `/forgot-password` - Password reset request

- **Settings**
  - `/_layout.settings` - Update account settings
  - `/_layout.login` - Update login credentials
  - `/_layout.social` - Update social media links
  - `/_layout.theme` - Update theme customization
  - `/_layout.technical-info` - Update technical info

- **Media Management**
  - `/_layout.media` - Upload/delete media files
  - `/_layout.playlist` - Manage playlist tracks

- **Billing**
  - `/_layout.billing.checkout` - Process payments
  - `/_layout.billing.methods` - Manage payment methods

### Super Admin App (`apps/super-admin`)

All administrative actions require CSRF protection:

- **Account Management**
  - Create/update/delete accounts
  - Manage account subscriptions

- **User Management**
  - Create/update/delete users
  - Assign roles

- **Domain Management**
  - Add/verify/delete custom domains

- **Security**
  - Block/unblock IP addresses
  - Manage rate limit violations

### Lobby App (`apps/lobby`)

- `/_index` - Password-protected lobby access

## Security Considerations

### Token Secret

The CSRF token security depends on the `CSRF_SECRET` or `SESSION_SECRET` environment variable:

- Must be at least 32 characters long
- Should be cryptographically random
- **NEVER** commit secrets to version control
- Use different secrets for development/staging/production

```bash
# .env
SESSION_SECRET=your-super-secret-key-at-least-32-characters-long-random-string
# or
CSRF_SECRET=dedicated-csrf-secret-at-least-32-characters-long
```

### SameSite Cookie Attribute

Session cookies use `sameSite: "lax"` which provides baseline CSRF protection:

- Blocks CSRF from cross-site POST requests
- Allows same-site navigation (clicking links)
- Does NOT protect against subdomain attacks

Our CSRF tokens provide **additional defense-in-depth** beyond cookie settings.

### Double-Submit Cookie Alternative

Our implementation uses the **synchronizer token pattern** (token in session) rather than **double-submit cookie** (token in cookie) because:

1. More secure - attacker cannot read session cookie contents
2. Works with httpOnly cookies
3. Resistant to subdomain attacks
4. No additional cookies needed

### Token Rotation

CSRF tokens are:

- Generated once per session
- Persist across requests
- Regenerated when session is destroyed
- NOT rotated on each request (performance)

For high-security operations (e.g., delete account), consider:

1. Requiring re-authentication
2. Adding email confirmation
3. Using short-lived tokens

## Error Handling

### 403 Forbidden Response

When CSRF verification fails, the server responds with:

```
HTTP/1.1 403 Forbidden
Content-Type: text/plain

Invalid CSRF token
```

Or:

```
HTTP/1.1 403 Forbidden
Content-Type: text/plain

CSRF token mismatch
```

### Handling Errors

```typescript
export async function action({ request }: Route.ActionArgs) {
  try {
    // Uses HMAC validation - no session needed
    await csrfProtect(request);
  } catch (error) {
    if (error instanceof Response && error.status === 403) {
      // CSRF verification failed
      return {
        error: "Your session has expired. Please refresh and try again.",
      };
    }
    throw error;
  }

  // ... process action
}
```

## Testing

### Manual Testing

1. **Test Valid Token**
   - Submit form with correct token → Should succeed

2. **Test Missing Token**
   - Submit form without `_csrf` field → Should fail with 403

3. **Test Invalid Token**
   - Submit form with random/malformed token → Should fail with 403

4. **Test Token Mismatch**
   - Copy token from one session, use in another → Should fail with 403

5. **Test Expired Session**
   - Delete session cookie, submit form → Should fail with 403

### Automated Testing

```typescript
// Example test (Vitest)
import { describe, it, expect } from 'vitest';
import { generateCsrfToken, validateCsrfToken } from '@secretlobby/auth/csrf';

describe('CSRF Protection', () => {
  it('should generate valid tokens', () => {
    const token = generateCsrfToken();
    expect(validateCsrfToken(token)).toBe(true);
  });

  it('should reject invalid tokens', () => {
    expect(validateCsrfToken('invalid')).toBe(false);
    expect(validateCsrfToken('')).toBe(false);
    expect(validateCsrfToken(null)).toBe(false);
  });

  it('should reject malformed tokens', () => {
    expect(validateCsrfToken('abc.def')).toBe(false); // wrong length
    expect(validateCsrfToken('no-separator')).toBe(false);
  });
});
```

## Monitoring

Log CSRF verification failures to detect potential attacks:

```typescript
import { createLogger } from "@secretlobby/logger/server";
import { getSession } from "@secretlobby/auth";

const logger = createLogger({ service: "csrf" });

export async function action({ request }: Route.ActionArgs) {
  try {
    // Uses HMAC validation - no session needed
    await csrfProtect(request);
  } catch (error) {
    if (error instanceof Response && error.status === 403) {
      // Get session just for logging (optional)
      const { session } = await getSession(request);
      logger.warn({
        ip: request.headers.get('x-forwarded-for'),
        url: request.url,
        userId: session.userId,
      }, 'CSRF verification failed');
    }
    throw error;
  }

  // ... process action
}
```

## Troubleshooting

### Issue: "CSRF token mismatch" on legitimate requests

**Cause**: Token in form doesn't match session token

**Solutions**:
1. Ensure loader passes `csrfToken` to component
2. Check token is included in form submission
3. Verify session isn't being destroyed/regenerated unexpectedly

### Issue: "Invalid CSRF token" after session timeout

**Cause**: Session expired, but form still has old token

**Solutions**:
1. Add session timeout warnings
2. Refresh page before submitting important forms
3. Handle 403 errors gracefully with retry logic

### Issue: CSRF protection breaks API requests

**Cause**: API client not sending token

**Solutions**:
1. Include `X-CSRF-Token` header in all API requests
2. Or include `_csrf` in JSON request body
3. Ensure API client has access to token from loader data

## Best Practices

1. **Always use csrfProtect() for mutating actions**
   - POST, PUT, PATCH, DELETE operations
   - Any action that modifies data

2. **Don't protect GET requests**
   - GET should be safe/idempotent
   - No CSRF protection needed

3. **Include token in all forms**
   - Use hidden input field
   - Name it `_csrf`

4. **Use React Router Form component**
   - Automatically includes credentials
   - Works with our CSRF implementation

5. **Rotate session on privilege escalation**
   - After login
   - After role changes
   - This regenerates CSRF token

6. **Monitor CSRF failures**
   - High failure rate may indicate attack
   - Log IP, timestamp, endpoint

## References

- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [Synchronizer Token Pattern](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#synchronizer-token-pattern)
- [SameSite Cookie Attribute](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite)
