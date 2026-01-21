# ==============================================================================
# SecretLobby - Multi-App Dockerfile (Turborepo)
# ==============================================================================
# This Dockerfile can build any of the 4 apps: marketing, console, lobby, super-admin
# Usage: docker build --build-arg APP_NAME=console -t secretlobby-console .

ARG NODE_VERSION=20

# ==============================================================================
# Stage 1: Base - Install turbo
# ==============================================================================
FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
# Use npm for global install to avoid pnpm global bin directory issues
RUN npm install -g turbo@^2.5.0

# ==============================================================================
# Stage 2: Prune - Create pruned monorepo for specific app
# ==============================================================================
FROM base AS pruner
ARG APP_NAME
WORKDIR /app
COPY . .
RUN turbo prune @secretlobby/${APP_NAME} --docker

# ==============================================================================
# Stage 3: Dependencies - Install all dependencies
# ==============================================================================
FROM base AS installer
WORKDIR /app

# Copy lockfile and package.json's from prune
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Install dependencies
RUN pnpm install --frozen-lockfile

# ==============================================================================
# Stage 4: Builder - Build the application
# ==============================================================================
FROM base AS builder
ARG APP_NAME
WORKDIR /app

# Copy dependencies from installer
COPY --from=installer /app/ .

# Copy source code from prune
COPY --from=pruner /app/out/full/ .

# Generate Prisma client
RUN pnpm --filter @secretlobby/db db:generate

# Build the app and its dependencies
RUN turbo run build --filter=@secretlobby/${APP_NAME}...

# ==============================================================================
# Stage 5: Runner - Production runtime
# ==============================================================================
FROM node:${NODE_VERSION}-alpine AS runner
ARG APP_NAME
WORKDIR /app

# Add non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copy package files for production install
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Install only production dependencies
RUN pnpm install --prod --frozen-lockfile

# Copy built application from builder
COPY --from=builder /app/apps/${APP_NAME}/build ./apps/${APP_NAME}/build
COPY --from=builder /app/packages ./packages

# Copy .env file (will be overridden by environment variables in Dokploy)
COPY .env.example .env

# Create necessary directories
RUN mkdir -p /app/data /app/uploads && \
    chown -R appuser:nodejs /app

USER appuser

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

# Start the application
WORKDIR /app/apps/${APP_NAME}
CMD ["node", "./build/server/index.js"]
