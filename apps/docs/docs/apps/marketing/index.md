---
sidebar_position: 1
slug: /apps/marketing
---

# Marketing App

The marketing application serves as the public-facing website for SecretLobby at `secretlobby.co`.

## Overview

- **Package**: `@secretlobby/marketing`
- **Port**: 3000
- **Production URL**: https://secretlobby.co

## Features

- Landing page with interactive WebGL background
- Terms of Service page
- Privacy Policy page
- Internationalization (i18n) support

## Key Components

### LogoDistortionBackground

A WebGL-based component that renders 1000 logos with water ripple effects on mouse interaction.

**Features:**
- Instanced rendering for performance
- Water/pond ripple effect on mouse hover
- Touch support via touchend for mobile devices
- Canvas DPR capped at 2 for buffer sizing

```typescript
import { LogoDistortionBackground } from './components/LogoDistortionBackground';

// Used in the landing page
<LogoDistortionBackground />
```

## Routes

| Route | File | Description |
|-------|------|-------------|
| `/` | `_index.tsx` | Home/landing page |
| `/terms` | `terms.tsx` | Terms of service |
| `/privacy` | `privacy.tsx` | Privacy policy |

## Dependencies

This app depends on the following packages:
- `@secretlobby/auth` - Authentication utilities
- `@secretlobby/db` - Database access
- `@secretlobby/storage` - S3 storage
- `@secretlobby/ui` - Shared UI components

## Development

```bash
# Run marketing app only
pnpm dev --filter @secretlobby/marketing

# Build for production
pnpm build --filter @secretlobby/marketing
```
