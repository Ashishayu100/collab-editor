#!/bin/bash
# View container/nginx logs with options.

COMPOSE_FILE="/opt/collab-editor/deployment/aws/docker-compose.production.yml"

case "$1" in
  server)
    docker compose -f "$COMPOSE_FILE" logs -f --tail=100 server
    ;;
  client)
    docker compose -f "$COMPOSE_FILE" logs -f --tail=100 client
    ;;
  all)
    docker compose -f "$COMPOSE_FILE" logs -f --tail=100
    ;;
  nginx)
    sudo tail -f /var/log/nginx/access.log /var/log/nginx/error.log
    ;;
  *)
    echo "Usage: ./view-logs.sh [server|client|all|nginx]"
    ;;
esac
