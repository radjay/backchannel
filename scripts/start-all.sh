#!/bin/bash
# Start Synapse, Bridge, Archiver

set -e

/home/matrix-ai/scripts/load-env.sh

/home/matrix-ai/scripts/start-matrix.sh
/home/matrix-ai/scripts/start-bridge.sh
/home/matrix-ai/scripts/start-archiver-db.sh
/home/matrix-ai/scripts/start-web.sh
