---
sidebar_position: 2
slug: /apps/console
---

# Console App

The console application is the main user dashboard for managing accounts, media, playlists, and billing at `app.secretlobby.io`.

## Overview

- **Package**: `@secretlobby/console`
- **Port**: 3001
- **Production URL**: https://app.secretlobby.io

## Features

- User authentication (login/signup)
- Media management and uploads
- Playlist creation and organization
- Billing and subscription management
- User settings and preferences
- Social features
- Theme customization

## Routes

### Authentication
| Route | File | Description |
|-------|------|-------------|
| `/login` | `login.tsx` | User login |
| `/signup` | `signup.tsx` | User registration |

### Dashboard
| Route | File | Description |
|-------|------|-------------|
| `/media` | `_layout.media.tsx` | Media library |
| `/playlist` | `_layout.playlist.tsx` | Playlist management |
| `/billing` | `_layout.billing.tsx` | Billing and payments |
| `/settings` | `_layout.settings.tsx` | User settings |
| `/social` | `_layout.social.tsx` | Social features |
| `/theme` | `_layout.theme.tsx` | Theme customization |

### API Endpoints
| Route | File | Description |
|-------|------|-------------|
| `/api/media` | `api.media.ts` | Media upload/management API |
| `/api/webhooks/stripe` | `api.webhooks.stripe.ts` | Stripe webhook handler |

## Key Features

### Drag-and-Drop Sorting
Uses `@dnd-kit` for drag-and-drop functionality in playlists and media organization.

### Toast Notifications
Uses Sonner for toast notifications throughout the application.

### Image Processing
Uses Sharp for server-side image processing and optimization.

## Dependencies

This app depends on the following packages:
- `@secretlobby/auth` - Authentication and sessions
- `@secretlobby/db` - Database access
- `@secretlobby/email` - Email sending
- `@secretlobby/logger` - Logging
- `@secretlobby/payments` - Stripe integration
- `@secretlobby/storage` - S3 storage
- `@secretlobby/ui` - Shared UI components

## Development

```bash
# Run console app only
pnpm dev --filter @secretlobby/console

# Build for production
pnpm build --filter @secretlobby/console
```
