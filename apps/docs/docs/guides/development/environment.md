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
S3_CDN_URL="https://cdn.secretlobby.io"
```

### Stripe Payments

```bash
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
```

### Email (Resend)

```bash
RESEND_API_KEY="re_..."
EMAIL_FROM="noreply@secretlobby.io"
```

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
