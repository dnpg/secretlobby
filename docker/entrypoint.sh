#!/bin/sh
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "${YELLOW}🔧 Starting SecretLobby Console...${NC}"

# Check if this app should run migrations
if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "${YELLOW}📦 Running database migrations...${NC}"

  # Navigate to db package and run migrations
  cd /app/packages/db

  # Run Prisma migrations
  if npx prisma migrate deploy; then
    echo "${GREEN}✅ Migrations completed successfully${NC}"
  else
    echo "${RED}❌ Migration failed!${NC}"
    exit 1
  fi

  # Go back to app directory
  cd /app/apps/${APP_NAME}
else
  echo "${YELLOW}⏭️  Skipping migrations (RUN_MIGRATIONS not set)${NC}"
fi

echo "${GREEN}🚀 Starting application...${NC}"

# Start the application
exec npx react-router-serve ./build/server/index.js
