#!/bin/bash
# Status of Next.js web app

/home/matrix-ai/scripts/load-env.sh

# Check if next-server is listening on port 3000
if ss -tlnp 2>/dev/null | grep -q ":3000.*next-server"; then
  PID=$(ss -tlnp 2>/dev/null | grep ":3000.*next-server" | grep -oP 'pid=\K[0-9]+')
  echo "Web: running (PID: $PID, port 3000)"
else
  echo "Web: stopped"
fi



