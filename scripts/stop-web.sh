#!/bin/bash
# Stop Next.js web app

set -e

/home/matrix-ai/scripts/load-env.sh

PIDS=$(pgrep -f "next start" || pgrep -f "next-server" || true)

if [ -z "$PIDS" ]; then
  echo "ℹ️  Web already stopped"
  exit 0
fi

echo "🛑 Stopping web..."
echo "$PIDS" | xargs -r kill
sleep 2

if pgrep -f "next start" >/dev/null || pgrep -f "next-server" >/dev/null; then
  echo "⚠️  Force killing remaining processes..."
  pgrep -f "next start" | xargs -r kill -9
  pgrep -f "next-server" | xargs -r kill -9
  sleep 1
fi

if pgrep -f "next start" >/dev/null || pgrep -f "next-server" >/dev/null; then
  echo "❌ Web still running"
  exit 1
else
  echo "✅ Web stopped"
fi



