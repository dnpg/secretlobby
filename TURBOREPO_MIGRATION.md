# Turborepo Migration Plan

## Overview

Refactoring the current single-repo SecretLobby.io project into a Turborepo monorepo with 4 distinct React Router v7 apps and shared internal packages.

---

## Goal Architecture

### Apps
1. **marketing** (`domain.com`) - Public landing pages
2. **console** (`app.domain.com`) - Musician dashboard & music uploads
3. **lobby** (`*.domain.com`) - Fan-facing, password-protected lobby
4. **super-admin** (`admin.domain.com`) - Global management

### Packages
1. **@repo/db** - Prisma schema, migrations, and singleton client (Prisma v7)
2. **@repo/auth** - Shared authentication/permission logic
3. **@repo/ui** - Shared UI components (Tailwind/Radix)
4. **@repo/config** - Shared configurations

---

## New Folder Structure

```
band-blast/
├── apps/
│   ├── marketing/              # domain.com - Public landing pages
│   │   ├── app/
│   │   │   ├── routes/
│   │   │   ├── root.tsx
│   │   │   └── routes.ts
│   │   ├── public/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   └── react-router.config.ts
│   │
│   ├── console/                # app.domain.com - Musician dashboard
│   │   ├── app/
│   │   │   ├── routes/
│   │   │   │   ├── _index.tsx
│   │   │   │   ├── media.tsx
│   │   │   │   ├── playlist.tsx
│   │   │   │   └── theme.tsx
│   │   │   ├── root.tsx
│   │   │   └── routes.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   └── react-router.config.ts
│   │
│   ├── lobby/                  # *.domain.com - Fan-facing lobby
│   │   ├── app/
│   │   │   ├── routes/
│   │   │   │   ├── _index.tsx      # Password entry
│   │   │   │   ├── player.tsx      # Audio player
│   │   │   │   └── api.*.tsx       # Streaming endpoints
│   │   │   ├── lib/
│   │   │   │   └── subdomain.server.ts
│   │   │   ├── root.tsx
│   │   │   └── routes.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   └── react-router.config.ts
│   │
│   └── super-admin/            # admin.domain.com - Global management
│       ├── app/
│       │   ├── routes/
│       │   │   ├── _index.tsx
│       │   │   ├── accounts.tsx
│       │   │   ├── users.tsx
│       │   │   └── domains.tsx
│       │   ├── root.tsx
│       │   └── routes.ts
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       └── react-router.config.ts
│
├── packages/
│   ├── db/                     # @repo/db - Prisma schema & client
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   ├── src/
│   │   │   ├── index.ts        # Export prisma client
│   │   │   └── client.ts       # Singleton client
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── auth/                   # @repo/auth - Authentication logic
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── session.server.ts
│   │   │   ├── password.server.ts
│   │   │   └── oauth.server.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── ui/                     # @repo/ui - Shared components
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── lib/
│   │   │   │   └── utils.ts
│   │   │   ├── components/
│   │   │   │   ├── ColorModeToggle.tsx
│   │   │   │   └── AudioVisualizer.tsx
│   │   │   └── hooks/
│   │   │       └── useColorMode.tsx
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── config/                 # @repo/config - Shared configs
│       ├── tailwind/
│       │   └── tailwind.config.ts
│       ├── typescript/
│       │   └── base.json
│       └── package.json
│
├── docker/
│   ├── Dockerfile.app          # Multi-stage for apps
│   └── nginx/
│       ├── nginx.conf
│       └── conf.d/
│
├── docker-compose.yml
├── turbo.json
├── package.json
├── pnpm-workspace.yaml
└── .env.example
```

---

## Configuration Files

### Root `/package.json`

```json
{
  "name": "band-blast",
  "private": true,
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "db:generate": "turbo run db:generate",
    "db:migrate": "pnpm --filter @repo/db db:migrate",
    "db:migrate:deploy": "pnpm --filter @repo/db db:migrate:deploy",
    "db:push": "pnpm --filter @repo/db db:push",
    "db:studio": "pnpm --filter @repo/db db:studio",
    "clean": "turbo run clean && rm -rf node_modules",
    "format": "prettier --write \"**/*.{ts,tsx,md}\""
  },
  "devDependencies": {
    "prettier": "^3.5.0",
    "turbo": "^2.5.0",
    "typescript": "^5.9.2"
  },
  "packageManager": "pnpm@9.15.0",
  "engines": {
    "node": ">=20"
  }
}
```

### Root `/pnpm-workspace.yaml`

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

### Root `/turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build", "db:generate"],
      "outputs": ["build/**", ".react-router/**"],
      "env": ["NODE_ENV", "DATABASE_URL"]
    },
    "dev": {
      "dependsOn": ["^db:generate"],
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^lint"],
      "outputs": []
    },
    "typecheck": {
      "dependsOn": ["^build", "db:generate"],
      "outputs": []
    },
    "db:generate": {
      "cache": false,
      "outputs": ["node_modules/.prisma/**", "src/generated/**"]
    },
    "db:migrate": {
      "cache": false
    },
    "clean": {
      "cache": false
    }
  },
  "globalEnv": [
    "NODE_ENV",
    "DATABASE_URL",
    "SESSION_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET"
  ],
  "globalPassThroughEnv": ["REDIS_URL", "APP_DOMAIN"]
}
```

---

## Package: @repo/db

### `/packages/db/package.json`

```json
{
  "name": "@repo/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts"
    },
    "./client": {
      "types": "./src/client.ts",
      "import": "./src/client.ts"
    }
  },
  "scripts": {
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:migrate:deploy": "prisma migrate deploy",
    "db:push": "prisma db push",
    "db:studio": "prisma studio",
    "db:seed": "tsx prisma/seed.ts",
    "clean": "rm -rf node_modules src/generated"
  },
  "dependencies": {
    "@prisma/adapter-pg": "^7.2.0",
    "@prisma/client": "^7.2.0",
    "pg": "^8.16.3"
  },
  "devDependencies": {
    "prisma": "^7.2.0",
    "tsx": "^4.19.0",
    "typescript": "^5.9.2"
  }
}
```

### `/packages/db/prisma/schema.prisma`

```prisma
generator client {
  provider      = "prisma-client"
  output        = "../src/generated/client"
  moduleFormat  = "esm"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────

enum UserRole {
  OWNER
  ADMIN
  EDITOR
  VIEWER
}

enum DomainStatus {
  PENDING
  VERIFIED
  FAILED
}

enum SubscriptionTier {
  FREE
  STARTER
  PRO
  ENTERPRISE
}

// ─────────────────────────────────────────────────────────────
// MODELS
// ─────────────────────────────────────────────────────────────

model Account {
  id               String           @id @default(cuid())
  name             String
  slug             String           @unique
  subscriptionTier SubscriptionTier @default(FREE)
  stripeCustomerId String?
  settings         Json?
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt

  // Relations
  users          AccountUser[]
  lobbies        Lobby[]
  domains        Domain[]
  defaultLobbyId String?

  @@index([slug])
}

model User {
  id                   String    @id @default(cuid())
  email                String    @unique
  passwordHash         String
  name                 String?
  avatarUrl            String?
  emailVerified        Boolean   @default(false)
  emailVerifyToken     String?
  passwordResetToken   String?
  passwordResetExpires DateTime?
  lastLoginAt          DateTime?
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt

  // Relations
  accounts AccountUser[]
  sessions Session[]

  @@index([email])
}

model AccountUser {
  id         String    @id @default(cuid())
  accountId  String
  userId     String
  role       UserRole  @default(VIEWER)
  invitedAt  DateTime  @default(now())
  acceptedAt DateTime?
  invitedBy  String?

  account Account @relation(fields: [accountId], references: [id], onDelete: Cascade)
  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([accountId, userId])
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique
  accountId String?
  userAgent String?
  ipAddress String?
  createdAt DateTime @default(now())
  expiresAt DateTime

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([token])
}

model Lobby {
  id              String    @id @default(cuid())
  accountId       String
  name            String
  slug            String
  title           String?
  description     String?
  isPublished     Boolean   @default(false)
  isDefault       Boolean   @default(false)
  password        String?
  requiresAuth    Boolean   @default(false)
  settings        Json?
  backgroundImage String?
  bannerImage     String?
  profileImage    String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  publishedAt     DateTime?

  account Account @relation(fields: [accountId], references: [id], onDelete: Cascade)
  tracks  Track[]

  @@unique([accountId, slug])
  @@index([accountId])
}

model Track {
  id        String   @id @default(cuid())
  lobbyId   String
  title     String
  artist    String?
  filename  String
  duration  Int?
  position  Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  lobby Lobby @relation(fields: [lobbyId], references: [id], onDelete: Cascade)

  @@index([lobbyId])
  @@index([lobbyId, position])
}

model Domain {
  id                String       @id @default(cuid())
  accountId         String
  domain            String       @unique
  status            DomainStatus @default(PENDING)
  verificationToken String       @unique @default(cuid())
  verifiedAt        DateTime?
  lastCheckedAt     DateTime?
  sslEnabled        Boolean      @default(false)
  sslExpiresAt      DateTime?
  lobbyId           String?
  createdAt         DateTime     @default(now())
  updatedAt         DateTime     @updatedAt

  account Account @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@index([domain])
}

model AuditLog {
  id         String   @id @default(cuid())
  accountId  String?
  userId     String?
  action     String
  entityType String?
  entityId   String?
  oldData    Json?
  newData    Json?
  ipAddress  String?
  userAgent  String?
  createdAt  DateTime @default(now())

  @@index([accountId])
  @@index([userId])
  @@index([entityType, entityId])
  @@index([createdAt])
}
```

### `/packages/db/src/client.ts`

```typescript
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client/index.js";
import pg from "pg";

const { Pool } = pg;

// Singleton pattern for Prisma client
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: pg.Pool | undefined;
};

function createPrismaClient(): PrismaClient {
  // Create PostgreSQL connection pool
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  });

  globalForPrisma.pool = pool;

  // Create Prisma adapter
  const adapter = new PrismaPg(pool);

  // Create Prisma client with adapter
  const client = new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Graceful shutdown helper
export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
  if (globalForPrisma.pool) {
    await globalForPrisma.pool.end();
  }
}
```

### `/packages/db/src/index.ts`

```typescript
// Re-export Prisma client singleton
export { prisma, disconnectDb } from "./client.js";

// Re-export generated types for use across apps
export type {
  Account,
  User,
  AccountUser,
  Session,
  Lobby,
  Track,
  Domain,
  AuditLog,
} from "./generated/client/index.js";

// Re-export enums
export {
  UserRole,
  DomainStatus,
  SubscriptionTier,
} from "./generated/client/index.js";

// Re-export Prisma types for advanced queries
export { Prisma } from "./generated/client/index.js";
```

### `/packages/db/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Package: @repo/auth

### `/packages/auth/package.json`

```json
{
  "name": "@repo/auth",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts"
    },
    "./session": {
      "types": "./src/session.server.ts",
      "import": "./src/session.server.ts"
    },
    "./password": {
      "types": "./src/password.server.ts",
      "import": "./src/password.server.ts"
    },
    "./oauth": {
      "types": "./src/oauth.server.ts",
      "import": "./src/oauth.server.ts"
    }
  },
  "scripts": {
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@repo/db": "workspace:*",
    "arctic": "^3.7.0",
    "bcryptjs": "^3.0.3",
    "iron-session": "^8.0.4"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "typescript": "^5.9.2"
  },
  "peerDependencies": {
    "@react-router/node": "^7.0.0"
  }
}
```

### `/packages/auth/src/session.server.ts`

```typescript
import { getIronSession, type SessionOptions } from "iron-session";

export interface SessionData {
  // Legacy lobby access
  isAuthenticated?: boolean;
  lobbyId?: string;

  // User authentication
  userId?: string;
  userEmail?: string;
  userName?: string;

  // Account context
  currentAccountId?: string;
  currentAccountSlug?: string;
  currentAccountRole?: string;

  // OAuth state
  googleState?: string;
  googleCodeVerifier?: string;
}

const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: "secretlobby-session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
};

export async function getSession(request: Request): Promise<SessionData> {
  const response = new Response();
  const session = await getIronSession<SessionData>(
    request,
    response,
    sessionOptions
  );
  return session;
}

export async function createSessionResponse(
  data: Partial<SessionData>,
  request: Request,
  redirectTo: string
): Promise<Response> {
  const response = new Response(null, {
    status: 302,
    headers: { Location: redirectTo },
  });

  const session = await getIronSession<SessionData>(
    request,
    response,
    sessionOptions
  );

  Object.assign(session, data);
  await session.save();

  return response;
}

export async function updateSession(
  request: Request,
  data: Partial<SessionData>
): Promise<Response> {
  const response = new Response();
  const session = await getIronSession<SessionData>(
    request,
    response,
    sessionOptions
  );

  Object.assign(session, data);
  await session.save();

  return response;
}

export async function destroySession(
  request: Request,
  redirectTo: string
): Promise<Response> {
  const response = new Response(null, {
    status: 302,
    headers: { Location: redirectTo },
  });

  const session = await getIronSession<SessionData>(
    request,
    response,
    sessionOptions
  );

  session.destroy();

  return response;
}

// Auth guards
export function isLoggedIn(session: SessionData): boolean {
  return Boolean(session.userId);
}

export function hasAccountAccess(session: SessionData): boolean {
  return Boolean(session.currentAccountId);
}

export function isAdmin(session: SessionData): boolean {
  return (
    session.currentAccountRole === "OWNER" ||
    session.currentAccountRole === "ADMIN"
  );
}

export function requireAuth(session: SessionData, redirectTo = "/login") {
  if (!isLoggedIn(session)) {
    throw new Response(null, {
      status: 302,
      headers: { Location: redirectTo },
    });
  }
}

export function requireAdminRole(session: SessionData, redirectTo = "/") {
  requireAuth(session, redirectTo);
  if (!isAdmin(session)) {
    throw new Response(null, {
      status: 302,
      headers: { Location: redirectTo },
    });
  }
}
```

### `/packages/auth/src/password.server.ts`

```typescript
import bcrypt from "bcryptjs";
import { prisma, type User } from "@repo/db";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
  accounts: Array<{
    accountId: string;
    role: string;
    account: { id: string; name: string; slug: string };
  }>;
}

export async function authenticateWithPassword(
  email: string,
  password: string
): Promise<AuthenticatedUser | null> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: {
      accounts: {
        include: {
          account: {
            select: { id: true, name: true, slug: true },
          },
        },
      },
    },
  });

  if (!user) return null;

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) return null;

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    accounts: user.accounts.map((au) => ({
      accountId: au.accountId,
      role: au.role,
      account: au.account,
    })),
  };
}

export async function createUser(
  email: string,
  password: string,
  name?: string
): Promise<User> {
  const passwordHash = await hashPassword(password);

  return prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
      name,
    },
  });
}

export async function getUserById(
  id: string
): Promise<AuthenticatedUser | null> {
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      accounts: {
        include: {
          account: {
            select: { id: true, name: true, slug: true },
          },
        },
      },
    },
  });

  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    accounts: user.accounts.map((au) => ({
      accountId: au.accountId,
      role: au.role,
      account: au.account,
    })),
  };
}
```

### `/packages/auth/src/oauth.server.ts`

```typescript
import { Google } from "arctic";
import { prisma } from "@repo/db";
import type { AuthenticatedUser } from "./password.server.js";

let google: Google | null = null;

export function getGoogleClient(): Google | null {
  if (google) return google;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${process.env.AUTH_URL}/auth/google/callback`;

  if (!clientId || !clientSecret) return null;

  google = new Google(clientId, clientSecret, redirectUri);
  return google;
}

export function isGoogleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  );
}

interface GoogleUser {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
}

export async function authenticateWithGoogle(
  googleUser: GoogleUser
): Promise<AuthenticatedUser | null> {
  const allowedDomains = process.env.GOOGLE_ALLOWED_DOMAINS?.split(",") ?? [];

  if (allowedDomains.length > 0) {
    const emailDomain = googleUser.email.split("@")[1];
    if (!allowedDomains.includes(emailDomain)) {
      return null;
    }
  }

  // Find or create user
  let user = await prisma.user.findUnique({
    where: { email: googleUser.email.toLowerCase() },
    include: {
      accounts: {
        include: {
          account: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });

  if (!user) {
    // Create new user with random password (they'll use OAuth)
    const randomPassword = crypto.randomUUID();
    user = await prisma.user.create({
      data: {
        email: googleUser.email.toLowerCase(),
        passwordHash: randomPassword, // Not usable for login
        name: googleUser.name,
        avatarUrl: googleUser.picture,
        emailVerified: googleUser.email_verified ?? false,
      },
      include: {
        accounts: {
          include: {
            account: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });
  } else {
    // Update existing user info from Google
    await prisma.user.update({
      where: { id: user.id },
      data: {
        name: googleUser.name ?? user.name,
        avatarUrl: googleUser.picture ?? user.avatarUrl,
        lastLoginAt: new Date(),
      },
    });
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    accounts: user.accounts.map((au) => ({
      accountId: au.accountId,
      role: au.role,
      account: au.account,
    })),
  };
}
```

### `/packages/auth/src/index.ts`

```typescript
// Session management
export {
  getSession,
  createSessionResponse,
  updateSession,
  destroySession,
  isLoggedIn,
  hasAccountAccess,
  isAdmin,
  requireAuth,
  requireAdminRole,
  type SessionData,
} from "./session.server.js";

// Password authentication
export {
  hashPassword,
  verifyPassword,
  authenticateWithPassword,
  createUser,
  getUserById,
  type AuthenticatedUser,
} from "./password.server.js";

// OAuth
export {
  getGoogleClient,
  isGoogleConfigured,
  authenticateWithGoogle,
} from "./oauth.server.js";
```

---

## Package: @repo/ui

### `/packages/ui/package.json`

```json
{
  "name": "@repo/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts"
    },
    "./components/*": {
      "types": "./src/components/*.tsx",
      "import": "./src/components/*.tsx"
    },
    "./hooks/*": {
      "types": "./src/hooks/*.tsx",
      "import": "./src/hooks/*.tsx"
    }
  },
  "scripts": {
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@radix-ui/react-dialog": "^1.1.0",
    "@radix-ui/react-dropdown-menu": "^2.1.0",
    "@radix-ui/react-slot": "^1.1.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.6.0"
  },
  "devDependencies": {
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "typescript": "^5.9.2"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tailwindcss": "^4.0.0"
  }
}
```

### `/packages/ui/src/lib/utils.ts`

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

### `/packages/ui/src/hooks/useColorMode.tsx`

```typescript
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

export type UserColorMode = "dark" | "light" | "system";
export type ResolvedColorMode = "dark" | "light";

interface ColorModeContextValue {
  mode: UserColorMode;
  resolvedMode: ResolvedColorMode;
  setMode: (mode: UserColorMode) => void;
  isDark: boolean;
  isLight: boolean;
  allowUserColorMode: boolean;
}

const ColorModeContext = createContext<ColorModeContextValue | null>(null);

function getSystemPreference(): ResolvedColorMode {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

interface ColorModeProviderProps {
  children: ReactNode;
  initialColorMode?: UserColorMode;
  allowUserColorMode?: boolean;
}

export function ColorModeProvider({
  children,
  initialColorMode = "system",
  allowUserColorMode = true,
}: ColorModeProviderProps) {
  const [mode, setModeState] = useState<UserColorMode>(initialColorMode);
  const [systemPreference, setSystemPreference] =
    useState<ResolvedColorMode>("dark");

  useEffect(() => {
    setSystemPreference(getSystemPreference());

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      setSystemPreference(e.matches ? "dark" : "light");
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  const resolvedMode: ResolvedColorMode =
    mode === "system" ? systemPreference : mode;

  useEffect(() => {
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.classList.add(resolvedMode);
  }, [resolvedMode]);

  const setMode = useCallback(
    (newMode: UserColorMode) => {
      if (!allowUserColorMode) return;
      setModeState(newMode);
      localStorage.setItem("user-color-mode", newMode);
      document.cookie = `color-mode=${newMode}; path=/; max-age=31536000`;
    },
    [allowUserColorMode]
  );

  return (
    <ColorModeContext.Provider
      value={{
        mode,
        resolvedMode,
        setMode,
        isDark: resolvedMode === "dark",
        isLight: resolvedMode === "light",
        allowUserColorMode,
      }}
    >
      {children}
    </ColorModeContext.Provider>
  );
}

export function useColorMode(): ColorModeContextValue {
  const context = useContext(ColorModeContext);
  if (!context) {
    throw new Error("useColorMode must be used within ColorModeProvider");
  }
  return context;
}
```

### `/packages/ui/src/components/ColorModeToggle.tsx`

```typescript
import { useColorMode, type UserColorMode } from "../hooks/useColorMode.js";
import { cn } from "../lib/utils.js";

const modes: { value: UserColorMode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function ColorModeToggle({ className }: { className?: string }) {
  const { mode, setMode, allowUserColorMode } = useColorMode();

  if (!allowUserColorMode) return null;

  return (
    <div className={cn("flex gap-1 rounded-lg bg-muted p-1", className)}>
      {modes.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => setMode(value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            mode === value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
```

### `/packages/ui/src/index.ts`

```typescript
// Utilities
export { cn } from "./lib/utils.js";

// Hooks
export {
  useColorMode,
  ColorModeProvider,
  type UserColorMode,
  type ResolvedColorMode,
} from "./hooks/useColorMode.js";

// Components
export { ColorModeToggle } from "./components/ColorModeToggle.js";
```

---

## App Package Files

### `/apps/marketing/package.json`

```json
{
  "name": "@repo/marketing",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "react-router build",
    "dev": "react-router dev --port 3000",
    "start": "react-router-serve ./build/server/index.js",
    "typecheck": "react-router typegen && tsc",
    "lint": "eslint app/"
  },
  "dependencies": {
    "@react-router/node": "7.12.0",
    "@react-router/serve": "7.12.0",
    "@repo/ui": "workspace:*",
    "isbot": "^5.1.31",
    "react": "^19.2.3",
    "react-dom": "^19.2.3",
    "react-router": "7.12.0"
  },
  "devDependencies": {
    "@react-router/dev": "7.12.0",
    "@tailwindcss/vite": "^4.1.13",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "tailwindcss": "^4.1.13",
    "typescript": "^5.9.2",
    "vite": "^7.1.7",
    "vite-tsconfig-paths": "^5.1.4"
  }
}
```

### `/apps/console/package.json`

```json
{
  "name": "@repo/console",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "react-router build",
    "dev": "react-router dev --port 3001",
    "start": "react-router-serve ./build/server/index.js",
    "typecheck": "react-router typegen && tsc",
    "lint": "eslint app/",
    "db:generate": "echo 'Handled by @repo/db'"
  },
  "dependencies": {
    "@react-router/node": "7.12.0",
    "@react-router/serve": "7.12.0",
    "@repo/auth": "workspace:*",
    "@repo/db": "workspace:*",
    "@repo/ui": "workspace:*",
    "isbot": "^5.1.31",
    "react": "^19.2.3",
    "react-dom": "^19.2.3",
    "react-router": "7.12.0"
  },
  "devDependencies": {
    "@react-router/dev": "7.12.0",
    "@tailwindcss/vite": "^4.1.13",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "tailwindcss": "^4.1.13",
    "typescript": "^5.9.2",
    "vite": "^7.1.7",
    "vite-tsconfig-paths": "^5.1.4"
  }
}
```

### `/apps/lobby/package.json`

```json
{
  "name": "@repo/lobby",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "react-router build",
    "dev": "react-router dev --port 3002",
    "start": "react-router-serve ./build/server/index.js",
    "typecheck": "react-router typegen && tsc",
    "lint": "eslint app/",
    "db:generate": "echo 'Handled by @repo/db'"
  },
  "dependencies": {
    "@react-router/node": "7.12.0",
    "@react-router/serve": "7.12.0",
    "@repo/auth": "workspace:*",
    "@repo/db": "workspace:*",
    "@repo/ui": "workspace:*",
    "isbot": "^5.1.31",
    "react": "^19.2.3",
    "react-dom": "^19.2.3",
    "react-router": "7.12.0"
  },
  "devDependencies": {
    "@react-router/dev": "7.12.0",
    "@tailwindcss/vite": "^4.1.13",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "tailwindcss": "^4.1.13",
    "typescript": "^5.9.2",
    "vite": "^7.1.7",
    "vite-tsconfig-paths": "^5.1.4"
  }
}
```

### `/apps/super-admin/package.json`

```json
{
  "name": "@repo/super-admin",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "react-router build",
    "dev": "react-router dev --port 3003",
    "start": "react-router-serve ./build/server/index.js",
    "typecheck": "react-router typegen && tsc",
    "lint": "eslint app/",
    "db:generate": "echo 'Handled by @repo/db'"
  },
  "dependencies": {
    "@react-router/node": "7.12.0",
    "@react-router/serve": "7.12.0",
    "@repo/auth": "workspace:*",
    "@repo/db": "workspace:*",
    "@repo/ui": "workspace:*",
    "isbot": "^5.1.31",
    "react": "^19.2.3",
    "react-dom": "^19.2.3",
    "react-router": "7.12.0"
  },
  "devDependencies": {
    "@react-router/dev": "7.12.0",
    "@tailwindcss/vite": "^4.1.13",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "tailwindcss": "^4.1.13",
    "typescript": "^5.9.2",
    "vite": "^7.1.7",
    "vite-tsconfig-paths": "^5.1.4"
  }
}
```

---

## Lobby Subdomain Detection

### `/apps/lobby/app/lib/subdomain.server.ts`

```typescript
import { prisma, type Account, type Lobby } from "@repo/db";

export interface TenantContext {
  account: Account | null;
  lobby: Lobby | null;
  subdomain: string | null;
  isCustomDomain: boolean;
}

/**
 * Extract subdomain from the request hostname.
 * Handles both direct subdomains and nginx X-Subdomain header.
 */
export function extractSubdomain(request: Request): string | null {
  // First check for nginx forwarded subdomain header
  const forwardedSubdomain = request.headers.get("X-Subdomain");
  if (forwardedSubdomain) {
    return forwardedSubdomain;
  }

  // Parse from hostname
  const url = new URL(request.url);
  const hostname = request.headers.get("host") || url.hostname;
  const appDomain = process.env.APP_DOMAIN || "secretlobby.io";

  // Remove port if present
  const hostWithoutPort = hostname.split(":")[0];

  // Check if this is a subdomain of our app domain
  if (hostWithoutPort.endsWith(`.${appDomain}`)) {
    const subdomain = hostWithoutPort.replace(`.${appDomain}`, "");
    // Ignore www and empty subdomains
    if (subdomain && subdomain !== "www") {
      return subdomain;
    }
  }

  return null;
}

/**
 * Check if the hostname is a custom domain (not our app domain)
 */
export function isCustomDomain(request: Request): boolean {
  const url = new URL(request.url);
  const hostname = request.headers.get("host") || url.hostname;
  const appDomain = process.env.APP_DOMAIN || "secretlobby.io";
  const hostWithoutPort = hostname.split(":")[0];

  return (
    !hostWithoutPort.endsWith(`.${appDomain}`) &&
    hostWithoutPort !== appDomain &&
    hostWithoutPort !== `www.${appDomain}`
  );
}

/**
 * Resolve the tenant (account + lobby) from the request.
 * Used in loaders to filter data by band_id.
 */
export async function resolveTenant(request: Request): Promise<TenantContext> {
  const subdomain = extractSubdomain(request);
  const customDomain = isCustomDomain(request);

  // Try subdomain resolution first
  if (subdomain) {
    const account = await prisma.account.findUnique({
      where: { slug: subdomain },
      include: {
        lobbies: {
          where: { isDefault: true },
          take: 1,
        },
      },
    });

    if (account) {
      return {
        account,
        lobby: account.lobbies[0] || null,
        subdomain,
        isCustomDomain: false,
      };
    }
  }

  // Try custom domain resolution
  if (customDomain) {
    const url = new URL(request.url);
    const hostname = (
      request.headers.get("host") || url.hostname
    ).split(":")[0];

    const domain = await prisma.domain.findUnique({
      where: {
        domain: hostname,
        status: "VERIFIED",
      },
      include: {
        account: {
          include: {
            lobbies: {
              where: { isDefault: true },
              take: 1,
            },
          },
        },
      },
    });

    if (domain?.account) {
      return {
        account: domain.account,
        lobby: domain.account.lobbies[0] || null,
        subdomain: null,
        isCustomDomain: true,
      };
    }
  }

  return {
    account: null,
    lobby: null,
    subdomain,
    isCustomDomain: customDomain,
  };
}

/**
 * Require a valid tenant or throw a 404 response.
 */
export async function requireTenant(request: Request): Promise<{
  account: Account;
  lobby: Lobby;
  subdomain: string | null;
  isCustomDomain: boolean;
}> {
  const tenant = await resolveTenant(request);

  if (!tenant.account) {
    throw new Response("Band not found", { status: 404 });
  }

  if (!tenant.lobby) {
    throw new Response("Lobby not found", { status: 404 });
  }

  return {
    account: tenant.account,
    lobby: tenant.lobby,
    subdomain: tenant.subdomain,
    isCustomDomain: tenant.isCustomDomain,
  };
}
```

### Example Lobby Route: `/apps/lobby/app/routes/_index.tsx`

```typescript
import type { Route } from "./+types/_index";
import { requireTenant } from "~/lib/subdomain.server";
import { prisma } from "@repo/db";
import { getSession } from "@repo/auth";

export async function loader({ request }: Route.LoaderArgs) {
  // Resolve tenant from subdomain or custom domain
  const { account, lobby } = await requireTenant(request);

  // Get session for authentication state
  const session = await getSession(request);

  // Check if lobby requires password and user is authenticated
  const isAuthenticated =
    session.isAuthenticated && session.lobbyId === lobby.id;

  if (lobby.password && !isAuthenticated) {
    // Return lobby metadata for password form (no tracks)
    return {
      lobby: {
        id: lobby.id,
        name: lobby.name,
        title: lobby.title,
        description: lobby.description,
        backgroundImage: lobby.backgroundImage,
        bannerImage: lobby.bannerImage,
        profileImage: lobby.profileImage,
        settings: lobby.settings,
      },
      account: {
        id: account.id,
        name: account.name,
        slug: account.slug,
      },
      requiresPassword: true,
      isAuthenticated: false,
      tracks: [],
    };
  }

  // Fetch tracks for this lobby (filtered by band_id via lobbyId)
  const tracks = await prisma.track.findMany({
    where: { lobbyId: lobby.id },
    orderBy: { position: "asc" },
    select: {
      id: true,
      title: true,
      artist: true,
      duration: true,
      position: true,
    },
  });

  return {
    lobby: {
      id: lobby.id,
      name: lobby.name,
      title: lobby.title,
      description: lobby.description,
      backgroundImage: lobby.backgroundImage,
      bannerImage: lobby.bannerImage,
      profileImage: lobby.profileImage,
      settings: lobby.settings,
    },
    account: {
      id: account.id,
      name: account.name,
      slug: account.slug,
    },
    requiresPassword: false,
    isAuthenticated: true,
    tracks,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { lobby } = await requireTenant(request);
  const formData = await request.formData();
  const password = formData.get("password") as string;

  // Verify password
  if (password !== lobby.password) {
    return { error: "Invalid password" };
  }

  // Create authenticated session for this lobby
  const { createSessionResponse } = await import("@repo/auth");
  return createSessionResponse(
    {
      isAuthenticated: true,
      lobbyId: lobby.id,
    },
    request,
    "/"
  );
}

export default function LobbyIndex({ loaderData }: Route.ComponentProps) {
  const { lobby, account, requiresPassword, tracks } = loaderData;

  if (requiresPassword) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <form method="post" className="w-full max-w-sm space-y-4">
          <h1 className="text-2xl font-bold">{lobby.title || account.name}</h1>
          <p className="text-muted-foreground">
            Enter the password to access this lobby.
          </p>
          <input
            type="password"
            name="password"
            placeholder="Password"
            className="w-full rounded border px-4 py-2"
            required
          />
          <button
            type="submit"
            className="w-full rounded bg-primary px-4 py-2 text-primary-foreground"
          >
            Enter
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <h1 className="text-3xl font-bold">{lobby.title || account.name}</h1>
      <div className="mt-8 space-y-2">
        {tracks.map((track) => (
          <div key={track.id} className="rounded border p-4">
            <span className="font-medium">{track.title}</span>
            {track.artist && (
              <span className="text-muted-foreground"> — {track.artist}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Docker Configuration

### `/docker-compose.yml`

```yaml
services:
  # ─────────────────────────────────────────────────────────────
  # Database
  # ─────────────────────────────────────────────────────────────
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-secretlobby}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-secretlobby}
      POSTGRES_DB: ${POSTGRES_DB:-secretlobby}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-secretlobby}"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - secretlobby-network

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
    networks:
      - secretlobby-network

  # ─────────────────────────────────────────────────────────────
  # Applications
  # ─────────────────────────────────────────────────────────────
  marketing:
    build:
      context: .
      dockerfile: docker/Dockerfile.app
      args:
        APP_NAME: marketing
        APP_PORT: 3000
    environment:
      NODE_ENV: production
      PORT: 3000
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - secretlobby-network

  console:
    build:
      context: .
      dockerfile: docker/Dockerfile.app
      args:
        APP_NAME: console
        APP_PORT: 3001
    environment:
      NODE_ENV: production
      PORT: 3001
      DATABASE_URL: postgresql://${POSTGRES_USER:-secretlobby}:${POSTGRES_PASSWORD:-secretlobby}@postgres:5432/${POSTGRES_DB:-secretlobby}
      SESSION_SECRET: ${SESSION_SECRET}
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
      GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET}
      AUTH_URL: ${AUTH_URL:-https://app.secretlobby.co}
      REDIS_URL: redis://redis:6379
    volumes:
      - ./media:/app/media
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - secretlobby-network

  lobby:
    build:
      context: .
      dockerfile: docker/Dockerfile.app
      args:
        APP_NAME: lobby
        APP_PORT: 3002
    environment:
      NODE_ENV: production
      PORT: 3002
      DATABASE_URL: postgresql://${POSTGRES_USER:-secretlobby}:${POSTGRES_PASSWORD:-secretlobby}@postgres:5432/${POSTGRES_DB:-secretlobby}
      SESSION_SECRET: ${SESSION_SECRET}
      APP_DOMAIN: ${APP_DOMAIN:-secretlobby.io}
      REDIS_URL: redis://redis:6379
    volumes:
      - ./media:/app/media:ro
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - secretlobby-network

  super-admin:
    build:
      context: .
      dockerfile: docker/Dockerfile.app
      args:
        APP_NAME: super-admin
        APP_PORT: 3003
    environment:
      NODE_ENV: production
      PORT: 3003
      DATABASE_URL: postgresql://${POSTGRES_USER:-secretlobby}:${POSTGRES_PASSWORD:-secretlobby}@postgres:5432/${POSTGRES_DB:-secretlobby}
      SESSION_SECRET: ${SESSION_SECRET}
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
      GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET}
      AUTH_URL: ${AUTH_URL:-https://admin.secretlobby.io}
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - secretlobby-network

  # ─────────────────────────────────────────────────────────────
  # Reverse Proxy
  # ─────────────────────────────────────────────────────────────
  nginx:
    image: nginx:stable-alpine
    ports:
      - "${HTTP_PORT:-80}:80"
      - "${HTTPS_PORT:-443}:443"
    volumes:
      - ./docker/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./docker/nginx/conf.d:/etc/nginx/conf.d:ro
      - ./docker/nginx/ssl:/etc/nginx/ssl:ro
    depends_on:
      - marketing
      - console
      - lobby
      - super-admin
    networks:
      - secretlobby-network

  # ─────────────────────────────────────────────────────────────
  # Development Tools
  # ─────────────────────────────────────────────────────────────
  adminer:
    image: adminer:latest
    ports:
      - "8081:8080"
    depends_on:
      - postgres
    profiles:
      - dev
    networks:
      - secretlobby-network

volumes:
  postgres_data:
  redis_data:

networks:
  secretlobby-network:
    driver: bridge
```

### `/docker/Dockerfile.app`

```dockerfile
# ─────────────────────────────────────────────────────────────
# Stage 1: Install dependencies
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace configuration
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY turbo.json ./

# Copy all package.json files for workspace resolution
COPY apps/marketing/package.json ./apps/marketing/
COPY apps/console/package.json ./apps/console/
COPY apps/lobby/package.json ./apps/lobby/
COPY apps/super-admin/package.json ./apps/super-admin/
COPY packages/db/package.json ./packages/db/
COPY packages/auth/package.json ./packages/auth/
COPY packages/ui/package.json ./packages/ui/

# Copy Prisma schema for generation
COPY packages/db/prisma ./packages/db/prisma/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# ─────────────────────────────────────────────────────────────
# Stage 2: Build the application
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

ARG APP_NAME
ENV APP_NAME=${APP_NAME}

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy dependencies from previous stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/*/node_modules ./apps/
COPY --from=deps /app/packages/*/node_modules ./packages/

# Copy source code
COPY . .

# Generate Prisma client
RUN pnpm --filter @repo/db db:generate

# Build the specific app using Turborepo
RUN pnpm turbo run build --filter=@repo/${APP_NAME}

# ─────────────────────────────────────────────────────────────
# Stage 3: Production image
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

ARG APP_NAME
ARG APP_PORT=3000
ENV APP_NAME=${APP_NAME}
ENV PORT=${APP_PORT}
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

WORKDIR /app

# Copy built application
COPY --from=builder --chown=appuser:nodejs /app/apps/${APP_NAME}/build ./build
COPY --from=builder --chown=appuser:nodejs /app/apps/${APP_NAME}/package.json ./

# Copy workspace packages (for runtime imports)
COPY --from=builder --chown=appuser:nodejs /app/packages/db/src ./node_modules/@repo/db/src
COPY --from=builder --chown=appuser:nodejs /app/packages/db/package.json ./node_modules/@repo/db/
COPY --from=builder --chown=appuser:nodejs /app/packages/auth/src ./node_modules/@repo/auth/src
COPY --from=builder --chown=appuser:nodejs /app/packages/auth/package.json ./node_modules/@repo/auth/
COPY --from=builder --chown=appuser:nodejs /app/packages/ui/src ./node_modules/@repo/ui/src
COPY --from=builder --chown=appuser:nodejs /app/packages/ui/package.json ./node_modules/@repo/ui/

# Copy production node_modules
COPY --from=builder --chown=appuser:nodejs /app/node_modules ./node_modules

# Create media directory
RUN mkdir -p /app/media && chown appuser:nodejs /app/media

USER appuser

EXPOSE ${APP_PORT}

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT} || exit 1

CMD ["npm", "run", "start"]
```

### `/docker/nginx/nginx.conf`

```nginx
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;

    sendfile on;
    keepalive_timeout 65;
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=general:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;

    # Upstream servers
    upstream marketing { server marketing:3000; keepalive 32; }
    upstream console { server console:3001; keepalive 32; }
    upstream lobby { server lobby:3002; keepalive 32; }
    upstream super_admin { server super-admin:3003; keepalive 32; }

    # ─────────────────────────────────────────────────────────
    # Marketing: domain.com, www.domain.com
    # ─────────────────────────────────────────────────────────
    server {
        listen 80;
        listen 443 ssl;
        server_name secretlobby.io www.secretlobby.io;

        ssl_certificate /etc/nginx/ssl/fullchain.pem;
        ssl_certificate_key /etc/nginx/ssl/privkey.pem;

        location / {
            limit_req zone=general burst=20 nodelay;
            proxy_pass http://marketing;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }

    # ─────────────────────────────────────────────────────────
    # Console: app.domain.com
    # ─────────────────────────────────────────────────────────
    server {
        listen 80;
        listen 443 ssl;
        server_name app.secretlobby.co;

        ssl_certificate /etc/nginx/ssl/fullchain.pem;
        ssl_certificate_key /etc/nginx/ssl/privkey.pem;

        client_max_body_size 100M;

        location / {
            limit_req zone=general burst=20 nodelay;
            proxy_pass http://console;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }

    # ─────────────────────────────────────────────────────────
    # Super Admin: admin.domain.com
    # ─────────────────────────────────────────────────────────
    server {
        listen 80;
        listen 443 ssl;
        server_name admin.secretlobby.io;

        ssl_certificate /etc/nginx/ssl/fullchain.pem;
        ssl_certificate_key /etc/nginx/ssl/privkey.pem;

        location / {
            limit_req zone=general burst=20 nodelay;
            proxy_pass http://super_admin;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }

    # ─────────────────────────────────────────────────────────
    # Lobby: *.domain.com (wildcard subdomain)
    # ─────────────────────────────────────────────────────────
    server {
        listen 80;
        listen 443 ssl;
        server_name ~^(?<subdomain>.+)\.secretlobby\.io$;

        ssl_certificate /etc/nginx/ssl/fullchain.pem;
        ssl_certificate_key /etc/nginx/ssl/privkey.pem;

        location / {
            limit_req zone=general burst=20 nodelay;
            proxy_pass http://lobby;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            # Pass subdomain to app for tenant resolution
            proxy_set_header X-Subdomain $subdomain;
        }

        location /api/ {
            limit_req zone=api burst=50 nodelay;
            proxy_pass http://lobby;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Subdomain $subdomain;
        }
    }

    # ─────────────────────────────────────────────────────────
    # Custom domains -> Lobby
    # ─────────────────────────────────────────────────────────
    server {
        listen 80 default_server;
        listen 443 ssl default_server;
        server_name _;

        ssl_certificate /etc/nginx/ssl/fullchain.pem;
        ssl_certificate_key /etc/nginx/ssl/privkey.pem;

        location / {
            limit_req zone=general burst=20 nodelay;
            proxy_pass http://lobby;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
```

---

## Step-by-Step Migration Guide

### Phase 1: Scaffold the Monorepo

```bash
# 1. Create new directory structure
mkdir -p apps/{marketing,console,lobby,super-admin}
mkdir -p packages/{db,auth,ui,config}
mkdir -p docker/nginx/{conf.d,ssl}

# 2. Initialize Turborepo
pnpm init
# Copy the root package.json, turbo.json, pnpm-workspace.yaml from above

# 3. Move Prisma to @repo/db
mv prisma packages/db/
mkdir -p packages/db/src
# Create packages/db/package.json, src/client.ts, src/index.ts

# 4. Install dependencies
pnpm install
```

### Phase 2: Extract Shared Packages

```bash
# 1. Create @repo/auth package
# Copy auth.server.ts, session.server.ts from app/lib/ to packages/auth/src/
# Update imports to use @repo/db

# 2. Create @repo/ui package
# Copy components/ and hooks/ from app/ to packages/ui/src/
# Export from packages/ui/src/index.ts

# 3. Generate Prisma client
pnpm --filter @repo/db db:generate
```

### Phase 3: Split Routes into Apps

```bash
# Current routes → App mapping:

# marketing app:
# - New landing pages (create from scratch)

# console app (from admin routes):
# - admin._index.tsx → _index.tsx
# - admin.media.tsx → media.tsx
# - admin.playlist.tsx → playlist.tsx
# - admin.theme.tsx → theme.tsx
# - admin.login.tsx → login.tsx
# - auth.google.tsx, auth.google.callback.tsx

# lobby app (from public routes):
# - home.tsx → _index.tsx
# - player.tsx
# - api.stream.$trackId.tsx
# - api.manifest.$trackId.tsx
# - api.segment.$trackId.$index.tsx
# - api.media.*.tsx

# super-admin app:
# - Create new global management routes
```

### Phase 4: Update Imports

```typescript
// Before (in current app):
import { prisma } from "~/lib/db.server";
import { getSession } from "~/lib/session.server";

// After (in monorepo apps):
import { prisma } from "@repo/db";
import { getSession } from "@repo/auth";
import { ColorModeToggle } from "@repo/ui";
```

### Phase 5: Test & Deploy

```bash
# 1. Run development
pnpm dev  # Starts all apps via Turborepo

# 2. Build all apps
pnpm build

# 3. Run with Docker
docker compose up --build

# 4. Run database migrations in production
pnpm db:migrate:deploy
```

---

## Quick Reference: Key Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all apps in development mode |
| `pnpm build` | Build all apps with Turborepo caching |
| `pnpm db:generate` | Generate Prisma client |
| `pnpm db:migrate` | Run migrations in dev |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm --filter @repo/console dev` | Run only console app |
| `pnpm turbo run build --filter=@repo/lobby` | Build only lobby app |

---

## Route Mapping Reference

| Current Route | Target App | New Route |
|--------------|------------|-----------|
| `home.tsx` | lobby | `_index.tsx` |
| `player.tsx` | lobby | `player.tsx` |
| `admin.tsx` | console | `_layout.tsx` |
| `admin._index.tsx` | console | `_index.tsx` |
| `admin.login.tsx` | console | `login.tsx` |
| `admin.media.tsx` | console | `media.tsx` |
| `admin.playlist.tsx` | console | `playlist.tsx` |
| `admin.theme.tsx` | console | `theme.tsx` |
| `auth.google.tsx` | console | `auth.google.tsx` |
| `auth.google.callback.tsx` | console | `auth.google.callback.tsx` |
| `api.stream.$trackId.tsx` | lobby | `api.stream.$trackId.tsx` |
| `api.manifest.$trackId.tsx` | lobby | `api.manifest.$trackId.tsx` |
| `api.segment.$trackId.$index.tsx` | lobby | `api.segment.$trackId.$index.tsx` |
| `api.media.*.tsx` | lobby | `api.media.*.tsx` |
| `api.token.$filename.tsx` | lobby | `api.token.$filename.tsx` |
| `logout.tsx` | console/lobby | `logout.tsx` |

---

## Notes

- **Package Manager**: pnpm with workspaces
- **Node Version**: 20+
- **Turborepo Version**: 2.5+
- **React Router Version**: 7.12.0
- **Prisma Version**: 7.2.0

The migration preserves all existing functionality while splitting the codebase into focused, maintainable applications with shared packages.
