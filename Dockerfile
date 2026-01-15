# ==============================================================================
# SecretLobby.io - Multi-stage Dockerfile
# ==============================================================================

# Stage 1: Install all dependencies
FROM node:20-alpine AS dependencies
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile

# Stage 2: Build the application
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN npx prisma generate

# Build the application
RUN pnpm run build

# Stage 3: Production image
FROM node:20-alpine AS production
WORKDIR /app

# Add non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 secretlobby

# Install production dependencies and generate Prisma client
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --prod --frozen-lockfile
RUN npx prisma generate

# Copy built application
COPY --from=builder /app/build ./build

# Create directories for content and media
RUN mkdir -p /app/content /app/media && \
    chown -R secretlobby:nodejs /app

USER secretlobby

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the application
CMD ["npm", "run", "start"]
