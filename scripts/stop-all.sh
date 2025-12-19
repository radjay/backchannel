#!/bin/bash
# Stop Synapse, Bridge, Archiver

set -e

/home/matrix-ai/scripts/load-env.sh

/home/matrix-ai/scripts/stop-web.sh || true
/home/matrix-ai/scripts/stop-archiver-db.sh || true
/home/matrix-ai/scripts/stop-bridge.sh || true
/home/matrix-ai/scripts/stop-matrix.sh || true
