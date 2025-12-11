#!/bin/bash
# Restart Next.js web app dev mode

set -e

/home/matrix-ai/scripts/stop-web-dev.sh
/home/matrix-ai/scripts/start-web-dev.sh
