---
sidebar_position: 1
---

# Environment Configuration

This guide covers the environment variables needed to run SecretLobby.

## Required Variables

### Database

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/secretlobby"
```

### Session & Security

```bash
SESSION_SECRET="your-32-character-secret-key"
CSRF_SECRET="your-csrf-secret-key"
```

### Redis (Rate Limiting)

```bash
REDIS_URL="redis://localhost:6379"
```

## Optional Variables

### AWS S3 Storage

```bash
AWS_ACCESS_KEY_ID="your-access-key"
AWS_SECRET_ACCESS_KEY="your-secret-key"
AWS_REGION="us-east-1"
S3_BUCKET="secretlobby-storage"
S3_CDN_URL="https://cdn.secretlobby.co"
```

### Stripe Payments

```bash
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
```

### Email

**Production (Resend):** set `RESEND_API_KEY` and `EMAIL_FROM`. Leave `SMTP_HOST` unset.

**Local testing (Mailpit):** run Docker with the `dev` profile so Mailpit is available, then in `.env` set:

```bash
SMTP_HOST=localhost
SMTP_PORT=1025
EMAIL_FROM="SecretLobby <noreply@secretlobby.co>"
```

Leave `RESEND_API_KEY` unset (or leave it set; SMTP takes precedence when `SMTP_HOST` is set). Open http://localhost:8025 to view all emails caught by Mailpit.

### OAuth Providers

```bash
# Google
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."

# GitHub
GITHUB_CLIENT_ID="..."
GITHUB_CLIENT_SECRET="..."
```

### CAPTCHA

```bash
CAPTCHA_SITE_KEY="..."
CAPTCHA_SECRET_KEY="..."
```

### Logging

```bash
LOG_LEVEL="debug"        # fatal, error, warn, info, debug, trace
LOG_PRETTY="true"        # Pretty print logs in development
```

## Environment Files

The project uses different environment files:

- `.env` - Local development (not committed)
- `.env.example` - Template for new developers
- `.env.test` - Test environment
- `.env.production` - Production (managed separately)

## Super Admin (initial platform admin)

To log in to the Super Admin app you must create the first admin user:

1. Set in your `.env` (repo root):

```bash
SUPER_ADMIN_EMAIL=admin@yourdomain.com
SUPER_ADMIN_PASSWORD=your-secure-admin-password
```

2. Run once: **`pnpm db:create-super-admin`** (from repo root).

This creates a User and Staff record so that email/password can sign in at the Super Admin app (e.g. http://localhost:3003). **In production** use only this command—do not run the full database seed. See **SUPER_ADMIN_SETUP.md** in the repository root for full steps and troubleshooting.

## Per-App Variables

Some variables are app-specific:

```bash
# Marketing
MARKETING_URL="http://localhost:3000"

# Console
CONSOLE_URL="http://localhost:3001"

# Lobby
LOBBY_URL="http://localhost:3002"

# Super Admin
SUPER_ADMIN_URL="http://localhost:3003"
```
