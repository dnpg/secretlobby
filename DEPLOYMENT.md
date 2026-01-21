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

## Step 2: Configure Environment Variables

Each app needs these environment variables in Dokploy:

### Shared Variables (all 4 apps)
```bash
NODE_ENV=production
CORE_DOMAIN=secretlobby.io  # Change to your domain
DATABASE_URL=postgresql://user:password@postgres:5432/secretlobby
SESSION_SECRET=generate-a-secure-32-char-minimum-secret
```

### Optional: Google OAuth (console app)
```bash
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_ALLOWED_DOMAINS=yourdomain.com
```

## Step 3: Deploy Each App in Dokploy

You'll create **4 separate services** in Dokploy, one for each app.

### Service 1: Marketing (secretlobby.io)
1. **Create Service** → Docker Build
2. **Repository**: Your git repository URL
3. **Branch**: main
4. **Build Arguments**:
   ```
   APP_NAME=marketing
   ```
5. **Port**: 3000
6. **Domain**: `secretlobby.io` and `www.secretlobby.io`
7. **Environment Variables**: Add shared variables above

### Service 2: Console (app.secretlobby.io)
1. **Create Service** → Docker Build
2. **Repository**: Same git repository
3. **Branch**: main
4. **Build Arguments**:
   ```
   APP_NAME=console
   ```
5. **Port**: 3000
6. **Domain**: `app.secretlobby.io`
7. **Environment Variables**: Add shared variables + Google OAuth

### Service 3: Lobby (*.secretlobby.io)
1. **Create Service** → Docker Build
2. **Repository**: Same git repository
3. **Branch**: main
4. **Build Arguments**:
   ```
   APP_NAME=lobby
   ```
5. **Port**: 3000
6. **Domain**: `*.secretlobby.io` (wildcard subdomain)
7. **Environment Variables**: Add shared variables

### Service 4: Super Admin (admin.secretlobby.io)
1. **Create Service** → Docker Build
2. **Repository**: Same git repository
3. **Branch**: main
4. **Build Arguments**:
   ```
   APP_NAME=super-admin
   ```
5. **Port**: 3000
6. **Domain**: `admin.secretlobby.io`
7. **Environment Variables**: Add shared variables

## Step 4: DNS Configuration

In your DNS provider (Cloudflare, Route53, etc.):

```
Type    Name        Value                       TTL
A       @           your.vps.ip.address         Auto
A       www         your.vps.ip.address         Auto
A       app         your.vps.ip.address         Auto
A       admin       your.vps.ip.address         Auto
A       *           your.vps.ip.address         Auto
```

The wildcard (*) record enables dynamic subdomains for user lobbies.

## Step 5: Run Database Migrations

After deploying the database service, run migrations:

1. SSH into your Dokploy VPS
2. Run:
   ```bash
   docker exec -it <console-container-id> sh
   cd /app/packages/db
   npx prisma migrate deploy
   ```

Or add a migration script to your CI/CD pipeline.

## Step 6: Create First Admin User

You need to create your first user via signup:
1. Go to `https://app.secretlobby.io/signup`
2. Create your account
3. This user will be the owner of the first account

## Testing the Deployment

1. **Marketing**: https://secretlobby.io → Should show marketing site
2. **Console**: https://app.secretlobby.io → Admin dashboard
3. **Lobby**: https://yourband.secretlobby.io → User lobby
4. **Super Admin**: https://admin.secretlobby.io → Super admin panel

## Build Arguments Summary

Each Dokploy service uses the **same Dockerfile** but with different build arguments:

| Service      | APP_NAME     | Domain                    | Port |
|--------------|--------------|---------------------------|------|
| Marketing    | marketing    | secretlobby.io            | 3000 |
| Console      | console      | app.secretlobby.io        | 3000 |
| Lobby        | lobby        | *.secretlobby.io          | 3000 |
| Super Admin  | super-admin  | admin.secretlobby.io      | 3000 |

## Troubleshooting

### Build fails with "turbo: command not found"
- Ensure the Dockerfile base stage installs turbo globally

### Database connection errors
- Check DATABASE_URL format
- Ensure PostgreSQL service is running
- Verify network connectivity between services

### Subdomain routing not working
- Verify wildcard DNS (*) is configured
- Check CORE_DOMAIN environment variable
- Ensure lobby service is running

### App not starting
- Check logs in Dokploy
- Verify all required environment variables are set
- Ensure port 3000 is exposed

## Monitoring

### Health Checks
Each app has a health endpoint:
- `https://your-app.io/health` (if implemented)

### Logs
View logs in Dokploy:
1. Go to Service
2. Click "Logs" tab
3. Monitor real-time logs

## Updating

To deploy updates:
1. Push changes to your git repository
2. In Dokploy, click "Rebuild" for each service
3. Dokploy will pull latest code and rebuild

## Rollback

If something goes wrong:
1. In Dokploy, go to Service
2. Click "Deployments" tab
3. Select previous successful deployment
4. Click "Rollback"

## Security Checklist

- [ ] Change all default passwords
- [ ] Use strong SESSION_SECRET (32+ characters)
- [ ] Enable HTTPS (Dokploy handles this via Let's Encrypt)
- [ ] Set up firewall rules
- [ ] Configure backup strategy for PostgreSQL
- [ ] Review and secure environment variables
- [ ] Disable debug mode in production

## Local Testing

To test the Docker build locally before deploying:

```bash
# Build for console app
docker build --build-arg APP_NAME=console -t secretlobby-console .

# Run it
docker run -p 3000:3000 --env-file .env secretlobby-console
```

Test each app (marketing, console, lobby, super-admin) before deploying.

## Support

For issues:
1. Check Dokploy logs
2. Verify environment variables
3. Test database connectivity
4. Review DNS configuration
