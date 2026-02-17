---
sidebar_position: 4
slug: /apps/super-admin
---

# Super Admin App

The super admin application provides platform-wide administrative control at `admin.secretlobby.co`.

## Overview

- **Package**: `@secretlobby/super-admin`
- **Port**: 3003
- **Production URL**: https://admin.secretlobby.co

## Features

- Super admin authentication
- User management
- Account management
- Domain configuration
- Subscription plan management
- Security logs and IP management
- Lead/interested user tracking
- Invitation management
- Favicon generation

## Routes

### Authentication
| Route | File | Description |
|-------|------|-------------|
| `/login` | `login.tsx` | Super admin login |

### Management
| Route | File | Description |
|-------|------|-------------|
| `/users` | `_layout.users.tsx` | User management |
| `/accounts` | `_layout.accounts.tsx` | Account management |
| `/accounts/:accountId` | `_layout.accounts.$accountId.tsx` | Individual account details |
| `/accounts/:accountId/users` | `_layout.accounts.$accountId.users.tsx` | Account users |
| `/accounts/:accountId/lobbies` | `_layout.accounts.$accountId.lobbies.tsx` | Account lobbies |
| `/domains` | `_layout.domains.tsx` | Domain management |
| `/plans` | `_layout.plans.tsx` | Subscription plans |
| `/security` | `_layout.security.tsx` | Security logs and IP management |
| `/interested` | `_layout.interested.tsx` | Interested users/leads |
| `/invitations` | `_layout.invitations.tsx` | User invitations |

### API Endpoints
| Route | File | Description |
|-------|------|-------------|
| `/api/favicon/generate` | `api.favicon.generate.ts` | Generate favicons |

## Key Features

### Favicon Generation

Uses Sharp and png-to-ico for generating favicons from uploaded images:

```typescript
// Generates multiple favicon sizes
// - favicon.ico (16x16, 32x32, 48x48)
// - apple-touch-icon.png (180x180)
// - favicon-32x32.png
// - favicon-16x16.png
```

### Account Hierarchy

Manages the relationship between:
- **Users** - Individual platform users
- **Accounts** - Business/organization accounts
- **Lobbies** - Streaming lobbies per account

### Security Features

- Security log viewing
- IP address management
- Access control and auditing

## Dependencies

This app depends on the following packages:
- `@secretlobby/auth` - Authentication
- `@secretlobby/db` - Database access
- `@secretlobby/email` - Email sending
- `@secretlobby/logger` - Logging
- `@secretlobby/storage` - S3 storage
- `@secretlobby/ui` - Shared UI components

## Development

```bash
# Run super-admin app only
pnpm dev --filter @secretlobby/super-admin

# Build for production
pnpm build --filter @secretlobby/super-admin
```

## Initial setup (first-time login)

Only users with a **Staff** record can log in. Create the first admin from the repo root:

1. Set in `.env`: `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD`
2. Run: **`pnpm db:create-super-admin`**
3. Log in at the Super Admin app (e.g. http://localhost:3003) with that email and password

**Production:** run only `pnpm db:create-super-admin` (do not run the full `pnpm db:seed`). See **SUPER_ADMIN_SETUP.md** in the repository root for full steps and troubleshooting.

## Access Control

The super admin app requires elevated privileges (Staff role). Add more staff from the Staff section in the app after the first login.
