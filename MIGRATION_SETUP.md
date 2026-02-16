# Database Migration Setup

## Overview

This project uses **Option 1: Designated Migration App** approach for running database migrations in production. The console app is responsible for running migrations automatically on startup.

## How It Works

### Architecture

```
┌─────────────────────────────────────────────────────┐
│  Console App (console.secretlobby.co)                   │
│  ┌──────────────────────────────────────────────┐   │
│  │ 1. Container starts                          │   │
│  │ 2. Entrypoint script checks RUN_MIGRATIONS  │   │
│  │ 3. Runs: prisma migrate deploy               │   │
│  │ 4. Starts React Router app                  │   │
│  └──────────────────────────────────────────────┘   │
│  Environment: RUN_MIGRATIONS=true                   │
└─────────────────────────────────────────────────────┘
                      │
                      ▼
              [PostgreSQL Database]
                      ▲
        ┌─────────────┼─────────────┐
        │             │             │
┌───────┴───────┐ ┌───┴───────┐ ┌──┴────────────┐
│ Marketing App │ │ Lobby App │ │ Super Admin   │
│ (no DB needed)│ │           │ │               │
└───────────────┘ └───────────┘ └───────────────┘
 Skips migrations   Skips migrations  Skips migrations
```

### Files Changed

1. **`docker/entrypoint.sh`** (NEW)
   - Startup script that checks `RUN_MIGRATIONS` environment variable
   - If true: runs `prisma migrate deploy`
   - If false/unset: skips migrations
   - Then starts the application

2. **`Dockerfile`** (MODIFIED)
   - Copies `docker/entrypoint.sh` to container
   - Uses `ENTRYPOINT` instead of `CMD`
   - Passes `APP_NAME` as environment variable

3. **`DEPLOYMENT.md`** (UPDATED)
   - Added migration configuration section
   - Updated console app deployment instructions
   - Added troubleshooting for migration issues

4. **`.env.example`** (UPDATED)
   - Added `RUN_MIGRATIONS` variable documentation

## Usage

### Local Development

When building and running locally:

```bash
# Build the console app
docker build --build-arg APP_NAME=console -t secretlobby-console .

# Run WITH migrations (console app)
docker run -d \
  -e DATABASE_URL="postgresql://..." \
  -e RUN_MIGRATIONS=true \
  secretlobby-console

# Run WITHOUT migrations (other apps)
docker run -d \
  -e DATABASE_URL="postgresql://..." \
  secretlobby-console
```

### Dokploy Deployment

#### Console App (console.secretlobby.co)
```bash
# Environment Variables
NODE_ENV=production
CORE_DOMAIN=secretlobby.co
SESSION_SECRET=your-secret-here
DATABASE_URL=postgresql://user:password@postgres:5432/secretlobby
RUN_MIGRATIONS=true  # ← CRITICAL: Only console has this
```

#### Marketing App (secretlobby.co)
```bash
# Environment Variables
NODE_ENV=production
CORE_DOMAIN=secretlobby.co
SESSION_SECRET=your-secret-here
CONSOLE_URL=//console.secretlobby.co
# NO RUN_MIGRATIONS - marketing skips migrations
```

#### Lobby & Super-Admin Apps
```bash
# Environment Variables
NODE_ENV=production
CORE_DOMAIN=secretlobby.co
SESSION_SECRET=your-secret-here
DATABASE_URL=postgresql://user:password@postgres:5432/secretlobby
# NO RUN_MIGRATIONS - these apps skip migrations
```

## Deployment Order

### First Deployment
1. **Console app** (migrations run automatically)
2. **Marketing app** (no DB needed)
3. **Lobby app** (connects to migrated DB)
4. **Super-admin app** (connects to migrated DB)

### Subsequent Deployments
1. **Console app first** (runs new migrations if any exist)
2. **Other apps** in any order

## Logs & Verification

### Successful Migration Run
```
🔧 Starting SecretLobby Console...
📦 Running database migrations...
Datasource "db": PostgreSQL database "secretlobby"...
1 migration found in prisma/migrations
Applying migration 20260114061710_initial_migration
✅ Migrations completed successfully
🚀 Starting application...
[react-router-serve] http://localhost:3000
```

### Skipping Migrations
```
🔧 Starting SecretLobby Console...
⏭️  Skipping migrations (RUN_MIGRATIONS not set)
🚀 Starting application...
[react-router-serve] http://localhost:3000
```

### Migration Failure
```
🔧 Starting SecretLobby Console...
📦 Running database migrations...
Error: DATABASE_URL environment variable is not set
❌ Migration failed!
[Container exits with code 1]
```

## Creating New Migrations

### Development Process

1. **Make schema changes** in `packages/db/prisma/schema.prisma`

2. **Create migration** (locally):
   ```bash
   cd packages/db
   pnpm db:migrate:create
   # Or to auto-create:
   pnpm db:migrate
   ```

3. **Commit migration files**:
   ```bash
   git add packages/db/prisma/migrations/
   git commit -m "feat: add new database schema"
   ```

4. **Deploy to production**:
   - Push to git repository
   - Dokploy rebuilds console app
   - Console app runs `prisma migrate deploy` on startup
   - New migration is applied automatically

## Troubleshooting

### Console app stuck on startup
**Symptoms**: Console container starts but never becomes healthy
**Solution**: Check logs for migration errors. Verify DATABASE_URL is correct.

### Other apps showing schema errors
**Symptoms**: "Table 'xyz' does not exist" errors
**Solution**: Console app migrations didn't run. Deploy console first.

### "Migration already applied" warnings
**Symptoms**: Warnings in logs about migrations being skipped
**Solution**: This is normal. Prisma tracks applied migrations automatically.

### Multiple apps running migrations
**Symptoms**: Database locks or duplicate migration attempts
**Solution**: Check that ONLY console app has `RUN_MIGRATIONS=true`.

## Benefits of This Approach

✅ **Zero manual intervention** - migrations run automatically
✅ **No race conditions** - only one app runs migrations
✅ **Fast startup** - other apps start immediately
✅ **Production-ready** - used by major platforms
✅ **Rollback safe** - if migrations fail, console won't start
✅ **Simple configuration** - just one environment variable
✅ **Clear logs** - colored output shows exactly what's happening

## Alternative Approaches (Not Implemented)

### Option 2: Separate Migration Job
Could create a 5th service in Dokploy that only runs migrations.
**Pros**: Clean separation
**Cons**: More complex, requires orchestration

### Option 3: Manual Migrations
Could SSH into VPS and run migrations manually.
**Pros**: Full control
**Cons**: Not automated, easy to forget

### Option 4: All Apps Run Migrations
Could have every app try to run migrations.
**Pros**: Simple config
**Cons**: Wasteful, potential for race conditions

---

## Summary

This migration setup follows industry best practices and requires minimal configuration. Just remember:

- **Console app**: `RUN_MIGRATIONS=true`
- **All other apps**: Don't set this variable
- **Deploy order**: Console first, others after
