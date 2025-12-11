#!/bin/bash
# Start Matrix Synapse only

set -e

/home/matrix-ai/scripts/load-env.sh

echo "🚀 Starting Matrix Synapse..."
sudo systemctl start matrix-synapse
sleep 3

if sudo systemctl is-active --quiet matrix-synapse; then
  echo "✅ Synapse running"
else
  echo "❌ Failed to start Synapse"
  exit 1
fi