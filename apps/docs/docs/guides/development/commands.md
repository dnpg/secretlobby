---
sidebar_position: 2
---

# Development Commands

Common commands for developing SecretLobby.

## Package Manager

This project uses **pnpm** as the package manager.

```bash
# Install dependencies
pnpm install

# Add a dependency to a specific app/package
pnpm add <package> --filter @secretlobby/console

# Add a dev dependency
pnpm add -D <package> --filter @secretlobby/ui
```

## Development

### Run All Apps

```bash
pnpm dev
```

### Run Specific App

```bash
pnpm dev --filter @secretlobby/marketing
pnpm dev --filter @secretlobby/console
pnpm dev --filter @secretlobby/lobby
pnpm dev --filter @secretlobby/super-admin
pnpm dev --filter @secretlobby/docs
```

### Run Multiple Apps

```bash
pnpm dev --filter @secretlobby/console --filter @secretlobby/lobby
```

## Building

### Build All

```bash
pnpm build
```

### Build Specific App

```bash
pnpm build --filter @secretlobby/console
```

### Build Packages Only

```bash
pnpm build --filter "./packages/*"
```

## Testing

### Run All Tests

```bash
pnpm test
```

### Run Tests for Specific Package

```bash
pnpm test --filter @secretlobby/auth
```

### Run Tests in Watch Mode

```bash
pnpm test:watch
```

## Database

All database commands are run from the **repo root** unless noted.

### Run Migrations

```bash
pnpm db:migrate
```

### Deploy Migrations (production)

```bash
pnpm db:migrate:deploy
```

### Create Migration

```bash
cd packages/db && pnpm prisma migrate dev --name <migration-name>
```

### Reset Database

```bash
pnpm db:reset
```

### Create Super Admin user (production-safe)

Creates or updates the initial platform admin from `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD`. Use this in production; do not run the full seed there.

```bash
pnpm db:create-super-admin
```

### Seed Database (local dev only)

Seeds demo data (demo users, lobbies, sample tracks) and optionally the Super Admin user. **Do not run in production.**

```bash
pnpm db:seed
```

### Open Prisma Studio

```bash
pnpm db:studio
```

### Generate Prisma Client

```bash
pnpm db:generate
```

## Type Checking

### Check All

```bash
pnpm typecheck
```

### Check Specific App

```bash
pnpm typecheck --filter @secretlobby/console
```

## Linting

### Lint All

```bash
pnpm lint
```

### Lint and Fix

```bash
pnpm lint --fix
```

## Clean

### Clean Build Artifacts

```bash
pnpm clean
```

### Clean and Reinstall

```bash
pnpm clean && rm -rf node_modules && pnpm install
```
