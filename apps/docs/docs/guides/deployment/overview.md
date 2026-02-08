---
sidebar_position: 1
---

# Deployment Overview

SecretLobby consists of multiple applications deployed to different domains.

## Deployment Targets

| App | Domain | Purpose |
|-----|--------|---------|
| Marketing | secretlobby.io | Public website |
| Console | app.secretlobby.io | User dashboard |
| Lobby | *.secretlobby.io | Streaming (subdomains) |
| Super Admin | admin.secretlobby.io | Administration |
| Docs | docs.secretlobby.io | Documentation |

## Build Process

Each app is built independently:

```bash
# Build a specific app
pnpm build --filter @secretlobby/console

# Build all apps
pnpm build
```

Build outputs are in each app's `build/` directory.

## Environment Variables

Production environment variables should be set in your deployment platform:

- Database connection
- Redis connection
- AWS credentials
- Stripe keys
- Email service keys
- OAuth credentials

See [Environment Configuration](/guides/development/environment) for the full list.

## Database Migrations

Run migrations before deploying new code:

```bash
cd packages/db
pnpm prisma migrate deploy
```

## Health Checks

Each app exposes a health check endpoint:

```
GET /api/health
```

Returns `200 OK` when the app is healthy.

## Recommended Platforms

- **Vercel** - Ideal for the React Router apps
- **Railway** - Good for full-stack apps with databases
- **Fly.io** - Good for global distribution
- **AWS** - For enterprise deployments

## Docker Support

Each app includes a Dockerfile for containerized deployments:

```bash
# Build Docker image
docker build -f apps/console/Dockerfile -t secretlobby-console .

# Run container
docker run -p 3001:3001 secretlobby-console
```
