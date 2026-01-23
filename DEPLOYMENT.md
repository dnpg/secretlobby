# Deployment Guide - Dokploy

This guide explains how to deploy the SecretLobby monorepo to your VPS using Dokploy.

## Architecture

This is a Turborepo monorepo with 4 applications:
- **marketing** - Main marketing site (`secretlobby.io`)
- **console** - Admin dashboard (`app.secretlobby.io`)
- **lobby** - User-facing lobby pages (`*.secretlobby.io`)
- **super-admin** - Super admin panel (`admin.secretlobby.io`)

All apps share:
- **@secretlobby/db** - Prisma database client
- **@secretlobby/auth** - Authentication utilities
- **@secretlobby/ui** - Shared UI components

## Prerequisites

1. **Dokploy installed** on your VPS
2. **PostgreSQL database** (can be created in Dokploy)
3. **Domain configured** with DNS pointing to your VPS

## Step 1: Database Setup

Create a PostgreSQL database in Dokploy:
1. Go to Dokploy → Services → Add PostgreSQL
2. Create database: `secretlobby`
3. Note the connection string

---

## Database Migrations

### Option 1: Build-Time Migrations (Recommended for Dokploy)

Migrations run during Docker build using BuildKit secrets. This ensures the database schema is ready before the app starts.

**Build Arguments:**
| Argument | Required | Description |
|----------|----------|-------------|
| `APP_NAME` | Yes | Which app to build (marketing, console, lobby, super-admin) |
| `RUN_MIGRATIONS` | No | Set to `true` to run migrations (only for console) |

**BuildKit Secret:**
| Secret | Description |
|--------|-------------|
| `DATABASE_URL` | Database connection string (passed securely, NOT stored in image) |

#### Security Warning

**Never use `--build-arg DATABASE_URL=...`**

Build arguments are visible in image history (`docker history <image>`). Always use BuildKit secrets:

```bash
# WRONG - credentials exposed in image layers
docker build --build-arg DATABASE_URL=postgresql://...

# CORRECT - credentials NOT stored in image
docker build --secret id=DATABASE_URL,src=/tmp/db_url.txt
```

#### Dokploy Configuration for Migrations

For the **console** app only, configure:

1. **Build Arguments:**
   ```
   APP_NAME=console
   RUN_MIGRATIONS=true
   ```

2. **BuildKit Secret** (in Dokploy's build settings):
   ```
   DATABASE_URL=postgresql://user:password@db-host:5432/secretlobby
   ```

For other apps (marketing, lobby, super-admin):
```
APP_NAME=marketing
RUN_MIGRATIONS=false  # or omit entirely
```

### Option 2: Runtime Migrations (Docker Compose)

When using `docker-compose.yml` locally, a dedicated `migrate` service runs before apps start:

```yaml
migrate:
  command: ["npx", "prisma", "migrate", "deploy", "--schema=/app/packages/db/prisma/schema.prisma"]
  restart: "no"
  depends_on:
    postgres:
      condition: service_healthy

console:
  depends_on:
    migrate:
      condition: service_completed_successfully
```

This pattern ensures:
- Migrations run exactly once before any app starts
- If migrations fail, apps don't start
- No race conditions between multiple apps

---

## Step 2: Configure Environment Variables

Each app needs these environment variables in Dokploy:

### Shared Variables (all apps)
```bash
NODE_ENV=production
CORE_DOMAIN=secretlobby.io
SESSION_SECRET=generate-a-secure-32-char-minimum-secret
```

### Cloudflare R2 Storage (console + lobby)
```bash
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_BUCKET_NAME=secretlobby-media
R2_PUBLIC_URL=https://cdn.secretlobby.co
```

### Database Variables (console, lobby, super-admin only)
```bash
DATABASE_URL=postgresql://user:password@postgres:5432/secretlobby
REDIS_URL=redis://redis:6379
```

### Google OAuth (console and super-admin)
```bash
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
AUTH_URL=https://app.secretlobby.io
```

---

## Step 3: Deploy Each App in Dokploy

Create **4 separate services** in Dokploy, one for each app.

### Service 1: Marketing (secretlobby.io)

| Setting | Value |
|---------|-------|
| Type | Docker Build |
| Dockerfile | `docker/Dockerfile` |
| Build Args | `APP_NAME=marketing` |
| Port | 3000 |
| Domain | `secretlobby.io`, `www.secretlobby.io` |

Environment Variables:
```
NODE_ENV=production
CORE_DOMAIN=secretlobby.io
CONSOLE_URL=//app.secretlobby.io
```

### Service 2: Console (app.secretlobby.io)

| Setting | Value |
|---------|-------|
| Type | Docker Build |
| Dockerfile | `docker/Dockerfile` |
| Build Args | `APP_NAME=console`, `RUN_MIGRATIONS=true` |
| BuildKit Secret | `DATABASE_URL=postgresql://...` |
| Port | 3000 |
| Domain | `app.secretlobby.io` |

Environment Variables:
```
NODE_ENV=production
CORE_DOMAIN=secretlobby.io
DATABASE_URL=postgresql://user:password@postgres:5432/secretlobby
SESSION_SECRET=your-secret-min-32-chars
REDIS_URL=redis://redis:6379
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
AUTH_URL=https://app.secretlobby.io
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_BUCKET_NAME=secretlobby-media
R2_PUBLIC_URL=https://cdn.secretlobby.co
```

### Service 3: Lobby (*.secretlobby.io)

| Setting | Value |
|---------|-------|
| Type | Docker Build |
| Dockerfile | `docker/Dockerfile` |
| Build Args | `APP_NAME=lobby` |
| Port | 3000 |
| Domain | `*.secretlobby.io` (wildcard) |

Environment Variables:
```
NODE_ENV=production
CORE_DOMAIN=secretlobby.io
DATABASE_URL=postgresql://user:password@postgres:5432/secretlobby
SESSION_SECRET=your-secret-min-32-chars
REDIS_URL=redis://redis:6379
APP_DOMAIN=secretlobby.io
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_BUCKET_NAME=secretlobby-media
R2_PUBLIC_URL=https://cdn.secretlobby.co
```

### Service 4: Super Admin (admin.secretlobby.io)

| Setting | Value |
|---------|-------|
| Type | Docker Build |
| Dockerfile | `docker/Dockerfile` |
| Build Args | `APP_NAME=super-admin` |
| Port | 3000 |
| Domain | `admin.secretlobby.io` |

Environment Variables:
```
NODE_ENV=production
CORE_DOMAIN=secretlobby.io
DATABASE_URL=postgresql://user:password@postgres:5432/secretlobby
SESSION_SECRET=your-secret-min-32-chars
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
AUTH_URL=https://admin.secretlobby.io
```

---

## Step 4: DNS Configuration

In your DNS provider:

```
Type    Name        Value                       TTL
A       @           your.vps.ip.address         Auto
A       www         your.vps.ip.address         Auto
A       app         your.vps.ip.address         Auto
A       admin       your.vps.ip.address         Auto
A       *           your.vps.ip.address         Auto
```

The wildcard (*) record enables dynamic subdomains for user lobbies.

---

## Step 5: Deployment Order

**First deployment:**
1. Deploy **console** first (runs migrations)
2. Wait for console to be healthy
3. Deploy marketing, lobby, super-admin in any order

**Subsequent deployments:**
1. Deploy console first if there are database changes
2. Deploy other apps in any order

---

## Local Development with Docker Compose

### Start All Services

```bash
# Start all services (includes automatic migrations)
docker compose up -d

# With Adminer for database management
docker compose --profile dev up -d

# View logs
docker compose logs -f

# Stop all services
docker compose down
```

### Build Individual Apps

```bash
# Build without migrations
docker build \
  --build-arg APP_NAME=console \
  -f docker/Dockerfile \
  -t secretlobby-console .

# Build with migrations (using BuildKit secret)
echo "postgresql://user:pass@localhost:5432/db" > /tmp/db_url.txt
docker build \
  --secret id=DATABASE_URL,src=/tmp/db_url.txt \
  --build-arg APP_NAME=console \
  --build-arg RUN_MIGRATIONS=true \
  -f docker/Dockerfile .
rm /tmp/db_url.txt
```

---

## Traefik Configuration (docker-compose.yml)

The local docker-compose uses Traefik as reverse proxy with:

### Middlewares

| Middleware | Description |
|------------|-------------|
| `compress` | Gzip compression |
| `ratelimit-general` | 10 req/s, burst 20 |
| `ratelimit-api` | 30 req/s, burst 50 |
| `large-upload` | 100MB max body size (console) |
| `security-headers` | XSS, nosniff, frame deny, HSTS |

### Domain Routing

| Route | Priority | Service |
|-------|----------|---------|
| `secretlobby.co` | 100 | marketing |
| `app.secretlobby.co` | 100 | console |
| `admin.secretlobby.co` | 100 | super-admin |
| `*.secretlobby.co` | 10 | lobby |
| `*` (catch-all) | 1 | lobby |

---

## Troubleshooting

### Migration Errors

| Issue | Solution |
|-------|----------|
| "Migration failed during build" | Check DATABASE_URL secret is configured correctly |
| "Database not accessible" | Verify database is reachable from Dokploy build environment |
| "Schema out of sync" | Deploy console app first to run migrations |

### Build Errors

| Issue | Solution |
|-------|----------|
| "turbo: command not found" | Dockerfile installs turbo globally in base stage |
| "pnpm install failed" | Check pnpm-lock.yaml is committed |

### Runtime Errors

| Issue | Solution |
|-------|----------|
| "Database connection refused" | Check DATABASE_URL environment variable |
| "Redis connection failed" | Verify REDIS_URL is correct |
| "Subdomain not routing" | Check wildcard DNS and CORE_DOMAIN |

### Manual Migration

If needed, run migrations manually:

```bash
# Via Dokploy terminal or SSH
docker exec -it <console-container> sh
cd /app/packages/db
npx prisma migrate deploy
```

---

## Security Checklist

- [ ] Use BuildKit secrets for DATABASE_URL in builds (never build args)
- [ ] Use strong SESSION_SECRET (32+ characters)
- [ ] Enable HTTPS via Dokploy/Let's Encrypt
- [ ] Set up firewall rules
- [ ] Configure PostgreSQL backups
- [ ] Review environment variables (no secrets in logs)
- [ ] Set NODE_ENV=production

---

## Build Arguments Summary

| Service | APP_NAME | RUN_MIGRATIONS | Domain |
|---------|----------|----------------|--------|
| Marketing | marketing | false | secretlobby.io |
| Console | console | true | app.secretlobby.io |
| Lobby | lobby | false | *.secretlobby.io |
| Super Admin | super-admin | false | admin.secretlobby.io |

---

## Monitoring

### Health Checks
Each app exposes `/` endpoint for monitoring.

### Logs
View logs in Dokploy: Service → Logs tab

---

## Rollback

If something goes wrong:
1. In Dokploy, go to Service → Deployments
2. Select previous successful deployment
3. Click "Rollback"
