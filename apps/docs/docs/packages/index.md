---
sidebar_position: 1
slug: /packages
---

# Shared Packages

SecretLobby uses a monorepo structure with shared packages that provide common functionality across all applications.

## Overview

| Package | Purpose |
|---------|---------|
| [@secretlobby/ui](/packages/ui) | Shared UI component library |
| [@secretlobby/auth](/packages/auth) | Authentication and session management |
| [@secretlobby/db](/packages/db) | Prisma database client and migrations |
| [@secretlobby/payments](/packages/payments) | Stripe payment processing |
| [@secretlobby/email](/packages/email) | Email sending with Resend |
| [@secretlobby/logger](/packages/logger) | Structured logging with Pino |
| [@secretlobby/storage](/packages/storage) | AWS S3 storage integration |

## Package Structure

All packages are located in the `packages/` directory:

```
packages/
├── ui/          # React components and hooks
├── auth/        # Authentication utilities
├── db/          # Prisma schema and client
├── payments/    # Stripe integration
├── email/       # Email service
├── logger/      # Logging utilities
└── storage/     # S3 file storage
```

## Using Packages

Import packages using their scoped names:

```typescript
// Import from UI package
import { Button, Dialog } from '@secretlobby/ui';

// Import from auth package
import { getSession, requireAuth } from '@secretlobby/auth';

// Import from db package
import { prisma } from '@secretlobby/db';
```

## Development

Build all packages:

```bash
pnpm build --filter "./packages/*"
```

Run package tests:

```bash
pnpm test --filter "./packages/*"
```
