#!/bin/bash
# Stop AI Media Analyzer service

set -e

/home/matrix-ai/scripts/load-env.sh

PIDS=$(pgrep -f "services/analyzer/dist/index.js" || true)

if [ -z "$PIDS" ]; then
  echo "ℹ️  Analyzer already stopped"
  exit 0
fi

echo "🛑 Stopping analyzer..."
echo "$PIDS" | xargs -r kill
sleep 2

if pgrep -f "services/analyzer/dist/index.js" >/dev/null; then
  echo "❌ Analyzer still running"
  exit 1
else
  echo "✅ Analyzer stopped"
fi
