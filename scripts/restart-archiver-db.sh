#!/bin/bash
# Restart Database-Based Archiver

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$SCRIPT_DIR/stop-archiver-db.sh"
sleep 1
"$SCRIPT_DIR/start-archiver-db.sh"
