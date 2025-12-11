#!/bin/bash
# Status of AI Media Analyzer service

/home/matrix-ai/scripts/load-env.sh

if pgrep -f "services/analyzer/dist/index.js" >/dev/null; then
  echo "Analyzer: running"
else
  echo "Analyzer: stopped"
fi
