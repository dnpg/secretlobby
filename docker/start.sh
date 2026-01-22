#!/bin/sh
set -e

# Run migrations if RUN_MIGRATIONS=true
if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "Running database migrations..."
  cd /app/packages/db
  npx prisma migrate deploy
  echo "Migrations completed successfully"
fi

# Start the application
cd /app/apps/${APP_NAME}
exec npx react-router-serve ./build/server/index.js
