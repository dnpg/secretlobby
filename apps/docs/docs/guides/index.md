---
sidebar_position: 1
slug: /
---

# Getting Started

Welcome to the SecretLobby documentation. This guide will help you get up and running with the platform.

## Prerequisites

- **Node.js** >= 20.0
- **pnpm** 9.15.0
- **PostgreSQL** (local or remote)
- **Redis** (for rate limiting)

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/dnpg/secretlobby.git
cd secretlobby
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Set Up Environment

Copy the example environment files:

```bash
cp .env.example .env
```

Configure your environment variables (see [Environment Configuration](/guides/development/environment)).

### 4. Set Up Database

```bash
# Run migrations (from repo root)
pnpm db:migrate

# Create the initial Super Admin user (required to log in to the admin panel)
# Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD in .env first
pnpm db:create-super-admin

# Optional: seed demo data (local dev only—creates demo users, lobbies, etc.)
pnpm db:seed
```

### 5. Start Development Server

```bash
# From the root directory
pnpm dev
```

This starts all applications:
- Marketing: http://localhost:3000
- Console: http://localhost:3001
- Lobby: http://localhost:3002
- Super Admin: http://localhost:3003
- Docs: http://localhost:3004

## Project Structure

```
secretlobby/
├── apps/
│   ├── marketing/     # Public website
│   ├── console/       # User dashboard
│   ├── lobby/         # Streaming pages
│   ├── super-admin/   # Admin panel
│   └── docs/          # This documentation
├── packages/
│   ├── ui/            # Shared components
│   ├── auth/          # Authentication
│   ├── db/            # Database (Prisma)
│   ├── payments/      # Stripe integration
│   ├── email/         # Email service
│   ├── logger/        # Logging
│   └── storage/       # S3 storage
└── docs/              # Legacy docs
```

## Next Steps

- Explore the [Applications](/apps) to understand each app
- Learn about [Shared Packages](/packages) for reusable code
- Read the [Development Commands](/guides/development/commands) for development workflows
- Check the [Deployment Overview](/guides/deployment/overview) for production setup
