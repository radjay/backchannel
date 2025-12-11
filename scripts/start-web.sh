#!/bin/bash
# Start Next.js web app

set -e

source /home/matrix-ai/scripts/load-env.sh
mkdir -p /home/matrix-ai/logs

# Check if next-server is already listening on port 3000
if ss -tlnp 2>/dev/null | grep -q ":3000.*next-server"; then
  PID=$(ss -tlnp 2>/dev/null | grep ":3000.*next-server" | grep -oP 'pid=\K[0-9]+')
  echo "ℹ️  Web already running (PID: $PID)"
  exit 0
fi

echo "🚀 Building web..."
npm run build --prefix /home/matrix-ai/web

echo "🚀 Starting web..."
nohup npm run start --prefix /home/matrix-ai/web > /home/matrix-ai/logs/web.log 2>&1 &
PID=$!
sleep 3

if kill -0 "$PID" 2>/dev/null; then
  echo "✅ Web running (PID: $PID)"
else
  echo "❌ Failed to start web"
  exit 1
fi



