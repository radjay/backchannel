#!/bin/bash
# Restart TypeScript archiver

set -e

/home/matrix-ai/scripts/load-env.sh

/home/matrix-ai/scripts/stop-archiver.sh || true
/home/matrix-ai/scripts/start-archiver.sh
