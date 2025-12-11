#!/bin/bash
# Stop WhatsApp bridge

set -e

/home/matrix-ai/scripts/load-env.sh

PIDS=$(pgrep -f mautrix-whatsapp || true)

if [ -z "$PIDS" ]; then
  echo "ℹ️  Bridge already stopped"
  exit 0
fi

echo "🛑 Stopping WhatsApp Bridge..."
echo "$PIDS" | xargs -r kill
sleep 2

if pgrep -f mautrix-whatsapp >/dev/null; then
  echo "❌ Bridge still running"
  exit 1
else
  echo "✅ Bridge stopped"
fi
