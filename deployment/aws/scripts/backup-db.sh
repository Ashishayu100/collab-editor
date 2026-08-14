#!/bin/bash
# Backup RDS to a local SQL dump. RDS already takes automated daily snapshots (see SETUP.md's
# 7-day retention setting) — this is extra, quickly-restorable insurance, not a replacement.
set -e

APP_DIR="/opt/collab-editor"
source "$APP_DIR/.env.production"

BACKUP_DIR="$APP_DIR/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="collab_backup_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "Backing up database..."

# Extract the host out of DATABASE_URL (postgresql://user:pass@HOST:port/db?...) rather than
# requiring a separate env var for it — DATABASE_URL is the one value guaranteed to be correct.
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\).*/\1/p')

PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
  -h "$DB_HOST" \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --no-owner \
  --no-acl \
  | gzip > "$BACKUP_DIR/$FILENAME"

echo "Backup saved: $BACKUP_DIR/$FILENAME ($(du -h "$BACKUP_DIR/$FILENAME" | cut -f1))"

# Keep only the last 7 backups.
ls -t "$BACKUP_DIR"/collab_backup_*.sql.gz | tail -n +8 | xargs rm -f 2>/dev/null || true
echo "Old backups cleaned up (keeping last 7)"
