#!/bin/bash
# Start TypeScript archiver

set -e

/home/matrix-ai/scripts/load-env.sh
mkdir -p /home/matrix-ai/logs

if pgrep -f "services/archiver-js/dist/index.js" >/dev/null; then
  PID=$(pgrep -f "services/archiver-js/dist/index.js" | head -1)
  echo "ℹ️  Archiver already running (PID: $PID)"
  exit 0
fi

echo "🚀 Building archiver..."
npm run archiver:build --prefix /home/matrix-ai > /dev/null

echo "🚀 Starting archiver..."
nohup node /home/matrix-ai/services/archiver-js/dist/index.js > /home/matrix-ai/logs/archiver.log 2>&1 &
PID=$!
sleep 3

if kill -0 "$PID" 2>/dev/null; then
  echo "✅ Archiver running (PID: $PID)"
else
  echo "❌ Failed to start archiver"
  exit 1
fi
