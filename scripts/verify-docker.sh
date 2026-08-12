#!/bin/bash
set -e

echo "=== CollabEdit Docker Verification ==="
echo ""

echo "1. Building Docker images..."
docker compose build
echo "   ✓ Images built"
echo ""

echo "2. Starting containers..."
docker compose --env-file .env.docker up -d
echo "   ✓ Containers started"
echo ""

echo "3. Waiting for services to be healthy..."
sleep 5

MAX_WAIT=90
WAITED=0
until curl -sf http://localhost:3001/api/health > /dev/null 2>&1; do
  WAITED=$((WAITED + 2))
  if [ $WAITED -ge $MAX_WAIT ]; then
    echo "   ✗ Server did not become healthy within ${MAX_WAIT}s"
    docker compose logs server
    docker compose down
    exit 1
  fi
  echo "   Waiting for server... (${WAITED}s)"
  sleep 2
done
echo "   ✓ Server is healthy"

WAITED=0
until curl -sf http://localhost/ > /dev/null 2>&1; do
  WAITED=$((WAITED + 2))
  if [ $WAITED -ge $MAX_WAIT ]; then
    echo "   ✗ Client did not become healthy within ${MAX_WAIT}s"
    docker compose logs client
    docker compose down
    exit 1
  fi
  sleep 2
done
echo "   ✓ Client is healthy"
echo ""

echo "4. Testing health endpoint..."
HEALTH=$(curl -sf http://localhost:3001/api/health)
echo "   $HEALTH"

REDIS_STATUS=$(echo "$HEALTH" | grep -o '"redis":"[^"]*"' || echo 'unknown')
DB_STATUS=$(echo "$HEALTH" | grep -o '"database":"[^"]*"' || echo 'unknown')
echo "   Redis: $REDIS_STATUS"
echo "   Database: $DB_STATUS"
echo ""

echo "5. Testing client SPA..."
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" http://localhost/)
if [ "$HTTP_CODE" = "200" ]; then
  echo "   ✓ Client serves index.html (HTTP $HTTP_CODE)"
else
  echo "   ✗ Client returned HTTP $HTTP_CODE"
fi
echo ""

echo "6. Testing API..."
SIGNUP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3001/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Docker Test","email":"docker@test.com","password":"DockerTest123"}')
if [ "$SIGNUP_CODE" = "201" ] || [ "$SIGNUP_CODE" = "409" ]; then
  echo "   ✓ API is responding (HTTP $SIGNUP_CODE)"
else
  echo "   ✗ API returned HTTP $SIGNUP_CODE"
fi
echo ""

echo "7. Container status:"
docker compose ps
echo ""

echo "=== Verification Complete ==="
echo ""
echo "App is running at: http://localhost"
echo "API is running at: http://localhost:3001"
echo ""
echo "To seed demo data: docker compose exec -w /app/server server npx prisma db seed"
echo "To stop: docker compose down"
echo "To stop and delete data: docker compose down -v"
