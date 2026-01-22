# syntax=docker/dockerfile:1
# ==============================================================================
# SecretLobby - Multi-App Dockerfile (Turborepo)
# ==============================================================================
# Build any of the 4 apps: marketing, console, lobby, super-admin
# Usage: docker build --build-arg APP_NAME=console -t secretlobby-console .

ARG NODE_VERSION=20
ARG PNPM_VERSION=10.28.0
ARG TURBO_VERSION=2.7.5

# ==============================================================================
# Stage 1: Base - Setup pnpm and turbo
# ==============================================================================
FROM node:${NODE_VERSION}-alpine AS base

ARG PNPM_VERSION
ARG TURBO_VERSION

WORKDIR /app

# Install pnpm via corepack
RUN corepack enable && \
    corepack prepare pnpm@${PNPM_VERSION} --activate

# Install turbo globally using npm (avoids pnpm global bin issues)
RUN npm install -g turbo@${TURBO_VERSION}

# ==============================================================================
# Stage 2: Prune - Create pruned monorepo for specific app
# ==============================================================================
FROM base AS pruner

ARG APP_NAME

WORKDIR /app

# Copy entire monorepo
COPY . .

# Prune the monorepo to only include the target app and its dependencies
RUN turbo prune @secretlobby/${APP_NAME} --docker

# ==============================================================================
# Stage 3: Dependencies - Install dependencies
# ==============================================================================
FROM base AS installer

WORKDIR /app

# Copy pruned lockfile and package.json files
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Install dependencies (including dev dependencies for build)
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ==============================================================================
# Stage 4: Builder - Build the application
# ==============================================================================
FROM base AS builder

ARG APP_NAME
ARG RUN_MIGRATIONS=false

WORKDIR /app

# Copy installed dependencies
COPY --from=installer /app/ .

# Copy source code
COPY --from=pruner /app/out/full/ .

# Generate Prisma client
RUN pnpm --filter @secretlobby/db db:generate

# Run migrations if RUN_MIGRATIONS=true (uses BuildKit secret for DATABASE_URL)
RUN --mount=type=secret,id=DATABASE_URL,required=false \
    if [ "$RUN_MIGRATIONS" = "true" ] && [ -f /run/secrets/DATABASE_URL ]; then \
      export DATABASE_URL=$(cat /run/secrets/DATABASE_URL) && \
      echo "Running database migrations..." && \
      cd packages/db && npx prisma migrate deploy && cd ../.. && \
      echo "Migrations completed"; \
    else \
      echo "Skipping migrations (RUN_MIGRATIONS=$RUN_MIGRATIONS)"; \
    fi

# Build the app and its dependencies
RUN turbo run build --filter=@secretlobby/${APP_NAME}...

# ==============================================================================
# Stage 5: Runner - Production runtime
# ==============================================================================
FROM node:${NODE_VERSION}-alpine AS runner

ARG APP_NAME
ARG PNPM_VERSION

WORKDIR /app

# Install security updates
RUN apk upgrade --no-cache

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

# Enable pnpm
RUN corepack enable && \
    corepack prepare pnpm@${PNPM_VERSION} --activate

# Copy pruned package.json files
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Install only production dependencies
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --prod --frozen-lockfile

# Copy built application and packages
COPY --from=builder --chown=appuser:nodejs /app/apps/${APP_NAME}/build ./apps/${APP_NAME}/build
COPY --from=builder --chown=appuser:nodejs /app/packages ./packages

# Create necessary directories with correct permissions
RUN mkdir -p /app/data /app/uploads /app/media && \
    chown -R appuser:nodejs /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 3000

# Set environment variables (APP_NAME is passed as build arg and stored for runtime)
ARG APP_NAME
ENV NODE_ENV=production \
    PORT=3000 \
    APP_NAME=${APP_NAME}

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the application
WORKDIR /app/apps/${APP_NAME}
CMD ["npx", "react-router-serve", "./build/server/index.js"]
