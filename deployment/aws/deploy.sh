#!/bin/bash
set -e

APP_DIR="/opt/collab-editor"
COMPOSE_FILE="$APP_DIR/deployment/aws/docker-compose.production.yml"
ENV_FILE="$APP_DIR/.env.production"
NGINX_CONF="$APP_DIR/deployment/aws/nginx/collab-editor.conf"

echo "=== CollabEdit Deployment ==="
echo ""

# ─── Pre-flight Checks ─────────────────────────────────
echo "1. Running pre-flight checks..."

if [ ! -f "$ENV_FILE" ]; then
  echo "   ERROR: $ENV_FILE not found. Create it from deployment/aws/.env.production.example"
  exit 1
fi

if ! docker info > /dev/null 2>&1; then
  echo "   ERROR: Docker is not running (or this user isn't in the docker group — log out/in after setup-ec2.sh)."
  exit 1
fi

echo "   ✓ Environment file found"
echo "   ✓ Docker is running"
echo ""

# ─── Pull Latest Code ──────────────────────────────────
echo "2. Pulling latest code..."
cd "$APP_DIR"
git pull origin main
echo "   ✓ Code updated"
echo ""

# ─── Build Docker Images ───────────────────────────────
echo "3. Building Docker images (this takes a few minutes)..."
docker compose -f "$COMPOSE_FILE" build --no-cache
echo "   ✓ Images built"
echo ""

# ─── Stop Old Containers ───────────────────────────────
echo "4. Stopping old containers..."
docker compose -f "$COMPOSE_FILE" down || true
echo "   ✓ Old containers stopped"
echo ""

# ─── Start New Containers ──────────────────────────────
echo "5. Starting new containers..."
docker compose -f "$COMPOSE_FILE" up -d
echo "   ✓ Containers started"
echo ""

# ─── Wait for Health ───────────────────────────────────
# server/scripts/docker-entrypoint.sh (baked into the image) runs `prisma migrate deploy`
# against RDS before the process even starts listening, so this doubles as "migrations applied".
echo "6. Waiting for server to be healthy..."
MAX_WAIT=90
WAITED=0
until curl -sf http://127.0.0.1:3001/api/health > /dev/null 2>&1; do
  WAITED=$((WAITED + 3))
  if [ $WAITED -ge $MAX_WAIT ]; then
    echo "   ✗ Server did not become healthy within ${MAX_WAIT}s"
    echo "   Checking logs:"
    docker compose -f "$COMPOSE_FILE" logs --tail=50 server
    exit 1
  fi
  echo "   Waiting... (${WAITED}s)"
  sleep 3
done
echo "   ✓ Server is healthy"
echo ""

# ─── Setup Nginx ───────────────────────────────────────
echo "7. Configuring Nginx..."
sudo cp "$NGINX_CONF" /etc/nginx/sites-available/collab-editor
sudo ln -sf /etc/nginx/sites-available/collab-editor /etc/nginx/sites-enabled/collab-editor
sudo rm -f /etc/nginx/sites-enabled/default

if sudo nginx -t 2>/dev/null; then
  sudo systemctl reload nginx
  echo "   ✓ Nginx configured and reloaded"
else
  echo "   ✗ Nginx config test failed"
  sudo nginx -t
  exit 1
fi
echo ""

# ─── Seed Database (safe to re-run — every write is an upsert) ────
echo "8. Running database seed..."
# -w sets the exec'd command's working directory to where server/package.json's `prisma.seed`
# config actually lives — `prisma db seed` looks for that key in the nearest package.json to its
# cwd, and at the container's default WORKDIR (/app) that would resolve to the root
# package.json instead, which has no such key, silently doing nothing.
if docker compose -f "$COMPOSE_FILE" exec -T -w /app/server server npx prisma db seed; then
  echo "   ✓ Seed complete"
else
  echo "   ⚠ Seed failed or was skipped — run manually to see why:"
  echo "     docker compose -f $COMPOSE_FILE exec -w /app/server server npx prisma db seed"
fi
echo ""

# ─── Health Check ──────────────────────────────────────
echo "9. Final health check..."
HEALTH=$(curl -sf http://127.0.0.1:3001/api/health || echo '{"status":"error"}')
echo "   $HEALTH"
echo ""

# ─── Status ────────────────────────────────────────────
echo "10. Container status:"
docker compose -f "$COMPOSE_FILE" ps
echo ""

# ─── Clean Up Old Images ──────────────────────────────
echo "11. Cleaning up old Docker images..."
docker image prune -f > /dev/null 2>&1
echo "   ✓ Cleanup complete"
echo ""

echo "=== Deployment Complete ==="
echo ""
PUBLIC_IP=$(curl -sf http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo 'YOUR_IP')
echo "Application is live at: http://$PUBLIC_IP"
echo ""
echo "Next steps:"
echo "  - Set up SSL: ./deployment/aws/setup-ssl.sh YOUR_DOMAIN"
echo "  - Monitor logs: docker compose -f $COMPOSE_FILE logs -f"
echo "  - Check admin dashboard: http://$PUBLIC_IP/admin"
