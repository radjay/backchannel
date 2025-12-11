#!/bin/bash
# Status of Next.js web app dev mode

/home/matrix-ai/scripts/load-env.sh

# Check if next-server is listening on port 3001
if ss -tlnp 2>/dev/null | grep -q ":3001.*next-server"; then
  PID=$(ss -tlnp 2>/dev/null | grep ":3001.*next-server" | grep -oP 'pid=\K[0-9]+')
  echo "Web dev: running (PID: $PID, port 3001)"
else
  echo "Web dev: stopped"
fi
