#!/bin/bash
# Restart WhatsApp bridge

set -e

/home/matrix-ai/scripts/load-env.sh

/home/matrix-ai/scripts/stop-bridge.sh || true
/home/matrix-ai/scripts/start-bridge.sh
