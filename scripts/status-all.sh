#!/bin/bash
# Status of Synapse, Bridge, Archiver, Analyzer

/home/matrix-ai/scripts/load-env.sh

/home/matrix-ai/scripts/status-matrix.sh
/home/matrix-ai/scripts/status-bridge.sh
/home/matrix-ai/scripts/status-archiver-db.sh
/home/matrix-ai/scripts/status-analyzer.sh
/home/matrix-ai/scripts/status-web.sh
