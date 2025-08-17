#!/bin/bash

# Matrix Server Cleanup Script
# This script undoes all Matrix server setup to test fresh installation

set -e

echo "=== Matrix Server Cleanup Started ==="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   print_error "This script must be run as root"
   exit 1
fi

DOMAIN="matrix.radx.dev"

# 1. Stop and disable services
print_status "Stopping Matrix services..."
systemctl stop matrix-synapse || true
systemctl disable matrix-synapse || true
systemctl stop nginx || true

# 2. Remove systemd service
print_status "Removing systemd service..."
rm -f /etc/systemd/system/matrix-synapse.service
systemctl daemon-reload

# 3. Remove nginx configuration
print_status "Removing nginx configuration..."
rm -f /etc/nginx/sites-enabled/$DOMAIN
rm -f /etc/nginx/sites-available/$DOMAIN
nginx -t && systemctl restart nginx || true

# 4. Remove SSL certificates
print_status "Removing SSL certificates..."
certbot delete --cert-name $DOMAIN --non-interactive || true

# 5. Remove PostgreSQL database and user
print_status "Removing PostgreSQL database and user..."
sudo -u postgres psql -c "DROP DATABASE IF EXISTS matrix;" || true
sudo -u postgres psql -c "DROP USER IF EXISTS matrix;" || true

# 6. Remove matrix system user
print_status "Removing matrix system user..."
userdel matrix || true
rm -rf /var/lib/matrix-synapse || true

# 7. Remove Synapse virtual environment
print_status "Removing Synapse virtual environment..."
rm -rf /opt/matrix

# 8. Remove repo configuration files (but keep repo structure)
print_status "Cleaning repo configuration files..."
rm -f /home/matrix-ai/config/matrix-synapse/homeserver.yaml
rm -f /home/matrix-ai/config/matrix-synapse/*.log.config
rm -f /home/matrix-ai/config/matrix-synapse/*.signing.key
rm -f /home/matrix-ai/homeserver.log
rm -f /home/matrix-ai/homeserver.pid
rm -rf /home/matrix-ai/media_store

# 9. Reset firewall rules
print_status "Resetting firewall rules..."
ufw --force reset
ufw allow 22/tcp comment 'SSH'
ufw --force enable

# 10. Clean up any remaining processes
print_status "Cleaning up processes..."
pkill -f synapse || true
pkill -f matrix || true

# 11. Remove packages (optional - commented out to avoid breaking system)
# print_status "Removing packages..."
# apt remove -y postgresql postgresql-contrib nginx certbot python3-certbot-nginx || true
# apt autoremove -y || true

print_status "=== Matrix Server Cleanup Complete ==="
print_warning "The following were NOT removed (to avoid system issues):"
echo "- PostgreSQL server (still installed but empty)"
echo "- nginx (still installed but no Matrix config)"
echo "- Python packages and certbot"
echo "- System packages"
print_status "System is now ready for fresh Matrix installation!"