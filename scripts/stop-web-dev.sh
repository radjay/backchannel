#!/bin/bash
# Stop Next.js web app dev mode

set -e

/home/matrix-ai/scripts/load-env.sh

# Check if next-server is listening on port 3001
if ! ss -tlnp 2>/dev/null | grep -q ":3001.*next-server"; then
  echo "ℹ️  Web dev already stopped"
  exit 0
fi

PID=$(ss -tlnp 2>/dev/null | grep ":3001.*next-server" | grep -oP 'pid=\K[0-9]+')
echo "🛑 Stopping web dev (PID: $PID)..."

# Kill the process and its parent shell
kill "$PID" 2>/dev/null || true
sleep 2

# Check if still running
if ss -tlnp 2>/dev/null | grep -q ":3001.*next-server"; then
  echo "⚠️  Force killing..."
  kill -9 "$PID" 2>/dev/null || true
  sleep 1
fi

if ss -tlnp 2>/dev/null | grep -q ":3001.*next-server"; then
  echo "❌ Web dev still running"
  exit 1
else
  echo "✅ Web dev stopped"
fi
