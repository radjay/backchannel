#!/bin/bash
# Stop Database-Based Archiver

PROCESS_NAME="archiver-db/dist/index.js"

if pgrep -f "$PROCESS_NAME" >/dev/null; then
  PID=$(pgrep -f "$PROCESS_NAME" | head -1)
  echo "Stopping archiver-db (PID: $PID)..."
  kill "$PID" 2>/dev/null
  sleep 2
  if kill -0 "$PID" 2>/dev/null; then
    echo "Force killing..."
    kill -9 "$PID" 2>/dev/null
  fi
  echo "Archiver-DB stopped"
else
  echo "Archiver-DB is not running"
fi
