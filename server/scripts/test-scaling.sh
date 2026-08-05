#!/bin/bash
# Test horizontal scaling with two server instances sharing one Redis + Postgres.
# Build first: npm run build --workspace=server

set -e
cd "$(dirname "$0")/.."

echo "Starting server instance 1 on port 3001..."
PORT=3001 node dist/index.js &
PID1=$!

echo "Starting server instance 2 on port 3002..."
PORT=3002 node dist/index.js &
PID2=$!

echo ""
echo "=== Two server instances running ==="
echo "Instance 1: http://localhost:3001 (PID: $PID1)"
echo "Instance 2: http://localhost:3002 (PID: $PID2)"
echo ""
echo "To test cross-server collaboration:"
echo "1. Open http://localhost:5173 and edit a document (connects to instance 1 by default)"
echo "2. Temporarily change the client's WebSocket URL to ws://localhost:3002"
echo "   and open the same document in another browser tab/profile"
echo "3. Both tabs should see each other's changes, cursors, and comments in real"
echo "   time — relayed through Redis, not a direct connection between the servers"
echo ""
echo "Check GET http://localhost:3001/api/health and :3002/api/health — each"
echo "reports its own serverId, so you can confirm which instance a client hit."
echo ""
echo "Press Ctrl+C to stop both instances"
echo ""

trap "kill $PID1 $PID2 2>/dev/null; echo 'Stopped both instances'; exit 0" SIGINT SIGTERM
wait
