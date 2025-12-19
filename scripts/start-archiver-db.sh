#!/bin/bash
# Start Database-Based Archiver

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/load-env.sh" 2>/dev/null || true

mkdir -p /home/matrix-ai/logs

SERVICE_DIR="/home/matrix-ai/services/archiver-db"
PROCESS_NAME="archiver-db/dist/index.js"

if pgrep -f "$PROCESS_NAME" >/dev/null; then
  PID=$(pgrep -f "$PROCESS_NAME" | head -1)
  echo "Archiver-DB already running (PID: $PID)"
  exit 0
fi

echo "Building archiver-db..."
npm run build --prefix "$SERVICE_DIR" > /dev/null

echo "Starting archiver-db..."
ENV_FILE=/home/matrix-ai/.env
if [ -f "$ENV_FILE" ]; then
  export $(grep -v '^#' "$ENV_FILE" | xargs)
fi

nohup node "$SERVICE_DIR/dist/index.js" > /home/matrix-ai/logs/archiver-db.log 2>&1 &
PID=$!
sleep 3

if kill -0 "$PID" 2>/dev/null; then
  echo "Archiver-DB running (PID: $PID)"
else
  echo "Failed to start archiver-db"
  tail -20 /home/matrix-ai/logs/archiver-db.log
  exit 1
fi
