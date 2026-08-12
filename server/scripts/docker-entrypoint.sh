#!/bin/sh
set -e

echo "=== CollabEdit Server Starting ==="
echo "Environment: $NODE_ENV"

# The postgres container's healthcheck (see docker-compose.yml's `depends_on: condition:
# service_healthy`) already gates this, so migrations should succeed on the first try — this
# retry loop is belt-and-suspenders for the rare case Postgres accepts TCP connections before
# it's actually ready to serve queries.
MAX_RETRIES=30
RETRY_COUNT=0
until npx prisma migrate deploy --schema=server/prisma/schema.prisma; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ "$RETRY_COUNT" -ge "$MAX_RETRIES" ]; then
    echo "ERROR: Could not apply migrations after $MAX_RETRIES attempts"
    exit 1
  fi
  echo "Waiting for database... (attempt $RETRY_COUNT/$MAX_RETRIES)"
  sleep 2
done

echo "Database migrations applied successfully"

echo "Starting server on port ${PORT:-3001}..."
exec node server/dist/index.js
