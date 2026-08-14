#!/bin/bash
# Quick health check — run via cron (see setup-cron.sh) or manually.

APP_DIR="/opt/collab-editor"
COMPOSE_FILE="$APP_DIR/deployment/aws/docker-compose.production.yml"
LOG_DIR="$APP_DIR/logs"
mkdir -p "$LOG_DIR"

HEALTH=$(curl -sf http://127.0.0.1:3001/api/health 2>/dev/null)
if [ $? -ne 0 ]; then
  echo "$(date): ALERT — Server health check failed!" | tee -a "$LOG_DIR/health.log"
  docker compose -f "$COMPOSE_FILE" restart
  echo "$(date): Containers restarted" | tee -a "$LOG_DIR/health.log"
else
  echo "$(date): OK — $HEALTH" >> "$LOG_DIR/health.log"
fi
