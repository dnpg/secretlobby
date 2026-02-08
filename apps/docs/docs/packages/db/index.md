---
sidebar_position: 3
slug: /packages/db
---

# Database

The db package provides the Prisma client and database utilities.

## Overview

- **Package**: `@secretlobby/db`
- **Technologies**: Prisma 7, PostgreSQL

## Usage

### Prisma Client

```typescript
import { prisma } from '@secretlobby/db';

// Query users
const users = await prisma.user.findMany();

// Create a new record
const user = await prisma.user.create({
  data: {
    email: 'user@example.com',
    name: 'John Doe',
  },
});

// Update a record
await prisma.user.update({
  where: { id: userId },
  data: { name: 'Jane Doe' },
});

// Delete a record
await prisma.user.delete({
  where: { id: userId },
});
```

### Relations

```typescript
// Include related data
const account = await prisma.account.findUnique({
  where: { id: accountId },
  include: {
    users: true,
    lobbies: true,
  },
});
```

## Schema

The Prisma schema is located at `packages/db/prisma/schema.prisma`.

### Key Models

- **User** - Platform users
- **Account** - Business/organization accounts
- **Lobby** - Streaming lobbies
- **Media** - Uploaded media files
- **Playlist** - Media playlists
- **Subscription** - Account subscriptions

## Migrations

### Create a Migration

```bash
cd packages/db
pnpm prisma migrate dev --name migration-name
```

### Apply Migrations

```bash
cd packages/db
pnpm prisma migrate deploy
```

### Reset Database

```bash
cd packages/db
pnpm prisma migrate reset
```

## Seeding

Seed the database with initial data:

```bash
cd packages/db
pnpm prisma db seed
```

The seed script is located at `packages/db/prisma/seed.ts`.

## Prisma Studio

Launch Prisma Studio for visual data exploration:

```bash
cd packages/db
pnpm prisma studio
```

## Configuration

Configure the database connection via environment variables:

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/secretlobby"
```
