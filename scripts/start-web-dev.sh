#!/bin/bash
# Start Next.js web app in dev mode

set -e

source /home/matrix-ai/scripts/load-env.sh
mkdir -p /home/matrix-ai/logs

# Check if next-server is already listening on port 3001
if ss -tlnp 2>/dev/null | grep -q ":3001.*next-server"; then
  PID=$(ss -tlnp 2>/dev/null | grep ":3001.*next-server" | grep -oP 'pid=\K[0-9]+')
  echo "ℹ️  Web dev already running (PID: $PID)"
  exit 0
fi

echo "🚀 Starting web dev server on port 3001..."
cd /home/matrix-ai/web
nohup npm run dev > /home/matrix-ai/logs/web-dev.log 2>&1 &
PID=$!
sleep 3

if kill -0 "$PID" 2>/dev/null; then
  echo "✅ Web dev running (PID: $PID) - Access at https://waos-dev.radx.dev"
else
  echo "❌ Failed to start web dev"
  exit 1
fi
