#!/bin/bash
# Start AI Media Analyzer service

set -e

/home/matrix-ai/scripts/load-env.sh
mkdir -p /home/matrix-ai/logs

if pgrep -f "services/analyzer/dist/index.js" >/dev/null; then
  PID=$(pgrep -f "services/analyzer/dist/index.js" | head -1)
  echo "ℹ️  Analyzer already running (PID: $PID)"
  exit 0
fi

echo "🚀 Building analyzer..."
npm run build --prefix /home/matrix-ai/services/analyzer > /dev/null

echo "🚀 Starting analyzer..."
ENV_FILE=/home/matrix-ai/.env
if [ -f "$ENV_FILE" ]; then
  export $(grep -v '^#' "$ENV_FILE" | xargs)
fi
nohup node /home/matrix-ai/services/analyzer/dist/index.js > /home/matrix-ai/logs/analyzer.log 2>&1 &
PID=$!
sleep 3

if kill -0 "$PID" 2>/dev/null; then
  echo "✅ Analyzer running (PID: $PID)"
else
  echo "❌ Failed to start analyzer"
  exit 1
fi
