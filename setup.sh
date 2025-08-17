#!/bin/bash

# Matrix Server Complete Setup Script
# Run as root: sudo bash setup.sh
# This script sets up a complete Matrix server with HTTPS

set -e

echo "=== Matrix Server Setup Started ==="

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

# Configuration
DOMAIN="matrix.radx.dev"
EMAIL="jeroen@seghers.com"
MATRIX_USER="matrix"
REPO_DIR="/home/matrix-ai"

# Check if .env file exists for database password
if [ ! -f "$REPO_DIR/.env" ]; then
    print_error ".env file not found in $REPO_DIR"
    print_error "Please ensure the repo is cloned and .env exists with MATRIX_DB_PASSWORD"
    exit 1
fi

# Source the environment file
source "$REPO_DIR/.env"

if [ -z "$MATRIX_DB_PASSWORD" ]; then
    print_error "MATRIX_DB_PASSWORD not found in .env file"
    exit 1
fi

print_status "Using database password from .env file"

# 1. System Update
print_status "Updating system packages..."
apt update && apt upgrade -y

# 2. Install dependencies
print_status "Installing system dependencies..."
apt install -y python3 python3-pip python3-venv postgresql postgresql-contrib nginx certbot python3-certbot-nginx ufw fail2ban

# 3. Configure firewall
print_status "Configuring firewall..."
ufw allow 22/tcp comment 'SSH'
ufw allow 443/tcp comment 'HTTPS Matrix'
ufw allow 80/tcp comment 'HTTP for SSL setup'
ufw --force enable

# 4. Setup PostgreSQL
print_status "Setting up PostgreSQL..."
systemctl start postgresql
systemctl enable postgresql

# Create database and user for Matrix
print_status "Creating PostgreSQL database and user..."
sudo -u postgres psql -c "CREATE USER $MATRIX_USER WITH PASSWORD '$MATRIX_DB_PASSWORD';" || true
sudo -u postgres psql -c "CREATE DATABASE $MATRIX_USER OWNER $MATRIX_USER ENCODING 'UTF8' LC_COLLATE='C' LC_CTYPE='C' template=template0;" || true

# 5. Create matrix system user
print_status "Creating matrix system user..."
adduser --system --home /var/lib/matrix-synapse --shell /bin/false $MATRIX_USER || true

# 6. Create virtual environment and install Synapse
print_status "Creating virtual environment for Synapse..."
mkdir -p /opt/matrix
python3 -m venv /opt/matrix/synapse-venv

print_status "Installing Matrix Synapse in virtual environment..."
source /opt/matrix/synapse-venv/bin/activate
pip install --upgrade pip
pip install matrix-synapse[postgres]
deactivate

# 7. Generate Synapse configuration (use repo config if exists)
if [ -f "$REPO_DIR/config/matrix-synapse/homeserver.yaml" ]; then
    print_status "Using existing Synapse configuration from repo..."
    # Configuration already exists in repo
else
    print_status "Generating new Synapse configuration..."
    mkdir -p $REPO_DIR/config/matrix-synapse
    cd $REPO_DIR
    source /opt/matrix/synapse-venv/bin/activate
    python -m synapse.app.homeserver \
        --server-name $DOMAIN \
        --config-path config/matrix-synapse/homeserver.yaml \
        --generate-config \
        --report-stats=no
    deactivate
    
    # Update database configuration
    print_status "Updating database configuration..."
    # Replace entire database section
    sed -i '/^database:/,/^[a-zA-Z]/{ /^[a-zA-Z]/!d; /^database:/d; }' config/matrix-synapse/homeserver.yaml
    sed -i '/^log_config:/i\
database:\
  name: psycopg2\
  args:\
    user: matrix\
    password: "'$MATRIX_DB_PASSWORD'"\
    database: matrix\
    host: localhost\
    port: 5432\
    cp_min: 5\
    cp_max: 10\
' config/matrix-synapse/homeserver.yaml
fi

# 8. Create systemd service
print_status "Creating systemd service..."
if [ -f "$REPO_DIR/config/matrix-synapse.service" ]; then
    ln -sf $REPO_DIR/config/matrix-synapse.service /etc/systemd/system/matrix-synapse.service
else
    cat > /etc/systemd/system/matrix-synapse.service << EOF
[Unit]
Description=Synapse Matrix homeserver
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=notify
User=$MATRIX_USER
WorkingDirectory=$REPO_DIR
ExecStart=/opt/matrix/synapse-venv/bin/python -m synapse.app.homeserver --config-path=$REPO_DIR/config/matrix-synapse/homeserver.yaml
ExecReload=/bin/kill -HUP \$MAINPID
Restart=always
RestartSec=3
SyslogIdentifier=matrix-synapse
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF
fi

# 9. Set permissions
print_status "Setting permissions..."
chown -R $MATRIX_USER:nogroup $REPO_DIR/config/matrix-synapse/
chown -R $MATRIX_USER:nogroup $REPO_DIR/media_store/ || mkdir -p $REPO_DIR/media_store && chown -R $MATRIX_USER:nogroup $REPO_DIR/media_store/
chown -R $MATRIX_USER:nogroup $REPO_DIR
chmod -R 755 $REPO_DIR

# 10. Configure nginx
print_status "Configuring nginx..."
if [ -f "$REPO_DIR/config/nginx-matrix.conf" ]; then
    ln -sf $REPO_DIR/config/nginx-matrix.conf /etc/nginx/sites-available/$DOMAIN
else
    cat > /etc/nginx/sites-available/$DOMAIN << EOF
server {
    listen 80;
    server_name $DOMAIN;
    
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    
    location / {
        return 301 https://\$server_name\$request_uri;
    }
}
EOF
fi

ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN
nginx -t

# 11. Get SSL certificates
print_status "Obtaining SSL certificates..."
systemctl restart nginx
certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email $EMAIL

# Update nginx config with Matrix proxy (add HTTPS manually after certbot)
print_status "Updating nginx configuration for Matrix..."
# Use existing config file from repo if available
if [ -f "$REPO_DIR/config/nginx-matrix.conf" ]; then
    cp $REPO_DIR/config/nginx-matrix.conf /etc/nginx/sites-available/$DOMAIN
else
    cat > /etc/nginx/sites-available/$DOMAIN << EOF
server {
    listen 80;
    server_name $DOMAIN;
    
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    
    location / {
        return 301 https://\$server_name\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN;

    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location ~* ^(\/_matrix|\/_synapse\/client) {
        proxy_pass http://127.0.0.1:8008;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Host \$host;
        client_max_body_size 50M;
        proxy_http_version 1.1;
    }
}
EOF
fi

nginx -t && systemctl restart nginx

# 12. Enable and start services
print_status "Enabling and starting services..."
systemctl daemon-reload
systemctl enable matrix-synapse postgresql nginx
systemctl start matrix-synapse

# 13. Wait for service to start and test
print_status "Waiting for Matrix service to start..."
sleep 10

if systemctl is-active --quiet matrix-synapse; then
    print_status "Matrix Synapse is running!"
else
    print_error "Matrix Synapse failed to start. Check logs with: journalctl -xeu matrix-synapse"
    exit 1
fi

# 14. Test HTTPS endpoint
print_status "Testing HTTPS endpoint..."
if curl -s -o /dev/null -w "%{http_code}" https://$DOMAIN/_matrix/client/versions | grep -q 200; then
    print_status "Matrix server is responding on HTTPS!"
else
    print_warning "Matrix server may not be responding correctly on HTTPS"
fi

# 15. Close HTTP port (optional)
print_status "Securing firewall (removing HTTP access)..."
ufw delete allow 80/tcp

print_status "=== Matrix Server Setup Complete ==="
print_status "Matrix server is running at: https://$DOMAIN"
print_warning "Next steps:"
echo "1. Create admin user: /opt/matrix/synapse-venv/bin/register_new_matrix_user -c config/matrix-synapse/homeserver.yaml https://$DOMAIN"
echo "2. Deploy Element Web client"
echo "3. Test user registration and room functionality"
echo "4. Configure automatic SSL renewal: sudo crontab -e"
echo "   Add: 0 12 * * * /usr/bin/certbot renew --quiet"