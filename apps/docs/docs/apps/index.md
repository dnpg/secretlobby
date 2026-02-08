---
sidebar_position: 1
slug: /apps
---

# Applications

SecretLobby is composed of four main applications, each serving a specific purpose in the platform.

## Overview

| App | Port | Domain | Purpose |
|-----|------|--------|---------|
| [Marketing](/apps/marketing) | 3000 | secretlobby.io | Public marketing website |
| [Console](/apps/console) | 3001 | app.secretlobby.io | User dashboard and management |
| [Lobby](/apps/lobby) | 3002 | *.secretlobby.io | Streaming and public lobbies |
| [Super Admin](/apps/super-admin) | 3003 | admin.secretlobby.io | Platform administration |

## Architecture

All applications are built with:
- **React 19** with React Router 7 (full-stack)
- **Vite** for development and building
- **Tailwind CSS 4** for styling
- **TypeScript** for type safety

Each app shares common functionality through the [packages](/packages) in the monorepo.

## Development

To run all apps in development mode:

```bash
pnpm dev
```

Or run individual apps:

```bash
pnpm dev --filter @secretlobby/marketing
pnpm dev --filter @secretlobby/console
pnpm dev --filter @secretlobby/lobby
pnpm dev --filter @secretlobby/super-admin
```
