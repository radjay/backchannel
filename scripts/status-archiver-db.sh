#!/bin/bash
# Status of Database-Based Archiver

if pgrep -f "archiver-db/dist/index.js" >/dev/null; then
  PID=$(pgrep -f "archiver-db/dist/index.js" | head -1)
  echo "Archiver-DB: running (PID: $PID)"
else
  echo "Archiver-DB: stopped"
fi
