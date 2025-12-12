#!/bin/bash
# Restart Next.js web app

set -e

/home/matrix-ai/scripts/load-env.sh

/home/matrix-ai/scripts/stop-web.sh || true
/home/matrix-ai/scripts/start-web.sh



