#!/bin/bash
# Stop Matrix Synapse

set -e

/home/matrix-ai/scripts/load-env.sh

echo "🛑 Stopping Matrix Synapse..."
sudo systemctl stop matrix-synapse || true

if sudo systemctl is-active --quiet matrix-synapse; then
  echo "❌ Synapse still running"
  exit 1
else
  echo "✅ Synapse stopped"
fi
#!/bin/bash
# Stop all Matrix services in reverse dependency order

set -e

echo "🛑 Stopping Matrix AI Server Services..."
echo

# Stop services in reverse dependency order (archiver -> bridge -> synapse)

echo "1. Stopping Matrix Archiver..."
pkill -f "unified_archiver.py" 2>/dev/null || echo "   Archiver not running"

echo "2. Stopping WhatsApp Bridge..."
pkill -f "mautrix-whatsapp" 2>/dev/null || echo "   Bridge not running"

echo "3. Stopping Synapse Matrix Server..."
sudo systemctl stop matrix-synapse || echo "   Synapse service error"

echo
echo "✅ All Matrix services stopped"
echo

# Show final status
echo "📊 Final Status:"
echo "   Synapse: $(sudo systemctl is-active matrix-synapse 2>/dev/null || echo 'inactive')"
echo "   Bridge: $(pgrep -f mautrix-whatsapp >/dev/null && echo 'running' || echo 'stopped')"
echo "   Archiver: $(pgrep -f unified_archiver.py >/dev/null && echo 'running' || echo 'stopped')"
echo