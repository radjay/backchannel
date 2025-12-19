#!/bin/bash
# Status of Matrix Synapse

/home/matrix-ai/scripts/load-env.sh

STATUS=$(sudo systemctl is-active matrix-synapse 2>/dev/null || echo "unknown")
echo "Synapse: $STATUS"
#!/bin/bash
# Check status of all Matrix services

echo "📊 Matrix AI Server Status"
echo "=========================="
echo

# Check Synapse
echo "🏠 Synapse Matrix Server:"
if sudo systemctl is-active --quiet matrix-synapse; then
    echo "   Status: ✅ Running"
    echo "   Since: $(sudo systemctl show matrix-synapse --property=ActiveEnterTimestamp | cut -d= -f2)"
else
    echo "   Status: ❌ Stopped"
fi

# Check WhatsApp Bridge
echo
echo "📱 WhatsApp Bridge:"
BRIDGE_PID=$(pgrep -f mautrix-whatsapp | head -1 2>/dev/null || echo "")
if [ -n "$BRIDGE_PID" ]; then
    echo "   Status: ✅ Running (PID: $BRIDGE_PID)"
    echo "   Memory: $(ps -p $BRIDGE_PID -o rss= 2>/dev/null | awk '{print $1/1024 " MB"}' || echo "N/A")"
else
    echo "   Status: ❌ Stopped"
fi

# Check Archiver
echo
echo "📚 Message Archiver:"
ARCHIVER_PID=$(pgrep -f "archiver-db/dist/index.js" 2>/dev/null | head -1 || echo "")
if [ -n "$ARCHIVER_PID" ]; then
    echo "   Status: ✅ Running (PID: $ARCHIVER_PID)"
    echo "   Memory: $(ps -p $ARCHIVER_PID -o rss= | awk '{print $1/1024 " MB"}')"
else
    echo "   Status: ❌ Stopped"
fi

# Check PostgreSQL
echo
echo "🗄️ PostgreSQL Database:"
if sudo systemctl is-active --quiet postgresql; then
    echo "   Status: ✅ Running"
else
    echo "   Status: ❌ Stopped"
fi

echo
echo "🌐 Service URLs:"
echo "   Element Web: http://localhost:8080"
echo "   Synapse API: http://localhost:8008"
echo "   WhatsApp Bridge: http://localhost:29318"

echo
echo "📁 Quick Log Commands:"
echo "   Synapse: journalctl -u matrix-synapse -f"
echo "   Bridge: tail -f /home/matrix-ai/logs/bridge.log"
echo "   Archiver: tail -f /home/matrix-ai/logs/archiver-db.log"
echo