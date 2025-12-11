#!/bin/bash
# Restart Matrix Synapse

set -e

/home/matrix-ai/scripts/load-env.sh

echo "🔄 Restarting Matrix Synapse..."
sudo systemctl restart matrix-synapse
sleep 3

if sudo systemctl is-active --quiet matrix-synapse; then
  echo "✅ Synapse running"
else
  echo "❌ Failed to restart Synapse"
  exit 1
fi
#!/bin/bash
# Restart all Matrix services

set -e

echo "🔄 Restarting Matrix AI Server Services..."
echo

# Stop all services first
echo "Stopping services..."
/home/matrix-ai/scripts/stop-matrix.sh

echo
echo "Waiting for clean shutdown..."
sleep 3

echo "Starting services..."
/home/matrix-ai/scripts/start-matrix.sh

echo "🎉 Matrix AI Server restart complete!"