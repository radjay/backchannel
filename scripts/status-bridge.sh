#!/bin/bash
# Status of WhatsApp bridge

/home/matrix-ai/scripts/load-env.sh

if pgrep -f mautrix-whatsapp >/dev/null; then
  echo "Bridge: running"
else
  echo "Bridge: stopped"
fi
