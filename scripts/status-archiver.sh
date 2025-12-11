#!/bin/bash
# Status of TypeScript archiver

/home/matrix-ai/scripts/load-env.sh

if pgrep -f "services/archiver-js/dist/index.js" >/dev/null; then
  echo "Archiver: running"
else
  echo "Archiver: stopped"
fi
