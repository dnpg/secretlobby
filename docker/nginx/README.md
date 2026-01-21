# Nginx Configuration

This directory contains environment-specific nginx configurations:

## Files

- **`nginx.dev.conf`** - Development configuration
  - Uses `.local` domains (secretlobby.local, app.secretlobby.local, etc.)
  - Proxies to `host.docker.internal:300X` (your local dev servers)
  - Only works with local `/etc/hosts` entries
  - ⚠️ **Never** use in production

- **`nginx.prod.conf`** - Production configuration
  - Uses real domains (secretlobby.co, app.secretlobby.co, etc.)
  - Proxies to Docker containers (marketing:3000, console:3001, etc.)
  - Requires DNS records pointing to your server
  - Use this for staging/production deployments

## Usage

The correct config is automatically selected based on `NODE_ENV` in your `.env`:

```bash
# Development (default)
NODE_ENV=development  # Uses nginx.dev.conf

# Production
NODE_ENV=production   # Uses nginx.prod.conf
```

## Security Notes

✅ **Safe in git**: The `.local` domains only resolve on developer machines with local `/etc/hosts` entries
✅ **Vite's `allowedHosts`**: Only applies to dev server, has no effect in production builds
⚠️ **Never** commit production secrets or API keys to nginx configs
