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

# Copy source code
COPY . .

# Generate Prisma client
RUN pnpm --filter @secretlobby/db db:generate

# Build the specific app using Turborepo
RUN pnpm turbo run build --filter=@secretlobby/${APP_NAME}

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

# Copy production node_modules
COPY --from=builder --chown=appuser:nodejs /app/node_modules ./node_modules

# Copy workspace packages
COPY --from=builder --chown=appuser:nodejs /app/packages ./packages

# Create media directory
RUN mkdir -p /app/media && chown appuser:nodejs /app/media

USER appuser

EXPOSE ${APP_PORT}

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/health || exit 1

CMD ["node", "./build/server/index.js"]
