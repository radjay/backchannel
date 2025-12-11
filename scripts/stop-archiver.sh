#!/bin/bash
# Stop TypeScript archiver

set -e

/home/matrix-ai/scripts/load-env.sh

PIDS=$(pgrep -f "services/archiver-js/dist/index.js" || true)

if [ -z "$PIDS" ]; then
  echo "ℹ️  Archiver already stopped"
  exit 0
fi

echo "🛑 Stopping archiver..."
echo "$PIDS" | xargs -r kill
sleep 2

if pgrep -f "services/archiver-js/dist/index.js" >/dev/null; then
  echo "❌ Archiver still running"
  exit 1
else
  echo "✅ Archiver stopped"
fi
