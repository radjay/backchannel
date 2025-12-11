#!/bin/bash
# Restart Synapse, Bridge, Archiver

set -e

/home/matrix-ai/scripts/load-env.sh

/home/matrix-ai/scripts/stop-all.sh || true
/home/matrix-ai/scripts/start-all.sh
