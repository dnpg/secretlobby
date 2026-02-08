---
sidebar_position: 5
slug: /packages/email
---

# Email

The email package provides email sending functionality using Resend.

## Overview

- **Package**: `@secretlobby/email`
- **Technologies**: Resend

## Usage

### Send Email

```typescript
import { sendEmail } from '@secretlobby/email';

await sendEmail({
  to: 'user@example.com',
  subject: 'Welcome to SecretLobby',
  html: '<h1>Welcome!</h1><p>Thanks for signing up.</p>',
});
```

### Send with Template

```typescript
import { sendEmail, templates } from '@secretlobby/email';

await sendEmail({
  to: 'user@example.com',
  subject: 'Verify your email',
  html: templates.verifyEmail({
    name: 'John',
    verificationUrl: 'https://app.secretlobby.io/verify?token=xxx',
  }),
});
```

### Available Templates

- **verifyEmail** - Email verification
- **resetPassword** - Password reset
- **welcome** - Welcome email
- **invitation** - Account invitation

## Email Templates

Templates are React components rendered to HTML:

```typescript
import { render } from '@react-email/render';
import { VerifyEmail } from './templates/verify-email';

const html = await render(
  <VerifyEmail name="John" verificationUrl="..." />
);
```

## Configuration

Configure Resend via environment variables:

```bash
RESEND_API_KEY=re_...
EMAIL_FROM=noreply@secretlobby.io
```

## Testing

In development, emails are logged to the console instead of being sent:

```typescript
// Set in .env.development
EMAIL_DEBUG=true
```
