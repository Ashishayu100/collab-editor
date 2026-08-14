#!/bin/bash
# Set up automated maintenance cron jobs. Safe to re-run — dedupes against what's already there.
set -e

APP_DIR="/opt/collab-editor"
mkdir -p "$APP_DIR/logs"

add_cron_job() {
  local schedule_and_cmd="$1"
  if ! crontab -l 2>/dev/null | grep -qF "$schedule_and_cmd"; then
    (crontab -l 2>/dev/null; echo "$schedule_and_cmd") | crontab -
  fi
}

echo "Setting up cron jobs..."

add_cron_job "*/5 * * * * $APP_DIR/deployment/aws/scripts/check-health.sh"
add_cron_job "0 3 * * * $APP_DIR/deployment/aws/scripts/backup-db.sh >> $APP_DIR/logs/backup.log 2>&1"
add_cron_job "0 4 * * 0 docker system prune -f >> $APP_DIR/logs/cleanup.log 2>&1"
add_cron_job "0 5 * * * find $APP_DIR/logs -name '*.log' -mtime +7 -delete"

echo "Cron jobs installed:"
crontab -l
