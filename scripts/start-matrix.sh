#!/bin/bash
# Start all Matrix services in correct dependency order

set -e

echo "🚀 Starting Matrix AI Server Services..."
echo

# Start services in dependency order (synapse -> bridge -> archiver)

echo "1. Starting Synapse Matrix Server..."
sudo systemctl start matrix-synapse
sleep 5

# Check if Synapse started successfully
if ! sudo systemctl is-active --quiet matrix-synapse; then
    echo "❌ Failed to start Synapse"
    exit 1
fi
echo "   ✅ Synapse running"

echo "2. Starting WhatsApp Bridge..."
# Check if bridge is already running
if pgrep -f mautrix-whatsapp >/dev/null; then
    BRIDGE_PID=$(pgrep -f mautrix-whatsapp | head -1)
    echo "   ℹ️  WhatsApp Bridge already running (PID: $BRIDGE_PID)"
else
    cd /home/matrix/whatsapp
    nohup ./mautrix-whatsapp -c /home/matrix-ai/config/mautrix-whatsapp/config.yaml > /home/matrix-ai/logs/bridge.log 2>&1 &
    BRIDGE_PID=$!
    sleep 5

    # Check if bridge is still running
    if ! kill -0 $BRIDGE_PID 2>/dev/null; then
        echo "❌ Failed to start WhatsApp Bridge"
        exit 1
    fi
    echo "   ✅ WhatsApp Bridge running (PID: $BRIDGE_PID)"
fi

echo "3. Starting Matrix Archiver..."
# Check if archiver is already running
if pgrep -f unified_archiver.py >/dev/null; then
    ARCHIVER_PID=$(pgrep -f unified_archiver.py | head -1)
    echo "   ℹ️  Matrix Archiver already running (PID: $ARCHIVER_PID)"
else
    cd /home/matrix-ai/services/archiver
    nohup ./scripts/start_archiver.sh > /home/matrix-ai/logs/archiver.log 2>&1 &
    ARCHIVER_PID=$!
    sleep 3

    # Check if archiver is still running
    if ! kill -0 $ARCHIVER_PID 2>/dev/null; then
        echo "❌ Failed to start Matrix Archiver"
        exit 1
    fi
    echo "   ✅ Matrix Archiver running (PID: $ARCHIVER_PID)"
fi

echo
echo "🎉 All Matrix services started successfully!"
echo

# Show final status
echo "📊 Service Status:"
echo "   Synapse: $(sudo systemctl is-active matrix-synapse)"
echo "   Bridge: $(pgrep -f mautrix-whatsapp >/dev/null && echo 'running' || echo 'stopped')"
echo "   Archiver: $(pgrep -f unified_archiver.py >/dev/null && echo 'running' || echo 'stopped')"
echo

# Show service URLs
echo "🌐 Access URLs:"
echo "   Element Web: http://localhost:8080"
echo "   Synapse API: http://localhost:8008"
echo "   WhatsApp Bridge: http://localhost:29318"
echo

echo "📁 Log Files:"
echo "   Synapse: journalctl -u matrix-synapse -f"
echo "   Bridge: tail -f /home/matrix-ai/logs/bridge.log"
echo "   Archiver: tail -f /home/matrix-ai/logs/archiver.log"
echo "   Bridge JSON: tail -f /home/matrix-ai/logs/mautrix-whatsapp.log"
echo