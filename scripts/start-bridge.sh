#!/bin/bash
# Start WhatsApp bridge

set -e

/home/matrix-ai/scripts/load-env.sh

mkdir -p /home/matrix-ai/logs

if pgrep -f mautrix-whatsapp >/dev/null; then
  PID=$(pgrep -f mautrix-whatsapp | head -1)
  echo "ℹ️  Bridge already running (PID: $PID)"
  exit 0
fi

echo "🚀 Starting WhatsApp Bridge..."
cd /home/matrix-ai/services/whatsapp-bridge/bin
nohup ./mautrix-whatsapp -c /home/matrix-ai/services/whatsapp-bridge/config/config.yaml > /home/matrix-ai/logs/bridge.log 2>&1 &
PID=$!
sleep 3

if kill -0 "$PID" 2>/dev/null; then
  echo "✅ Bridge running (PID: $PID)"
else
  echo "❌ Failed to start bridge"
  exit 1
fi
