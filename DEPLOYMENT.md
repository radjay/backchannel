# Matrix Server Deployment Guide

## Quick Setup (Fresh VPS)

For a completely fresh Ubuntu VPS, follow these steps:

### Prerequisites
1. Fresh Ubuntu 25.04 VPS with root access
2. Domain `matrix.radx.dev` pointing to your VPS IP
3. SSH key authentication configured

### Deployment Steps

1. **Clone the repository**
   ```bash
   git clone <this-repo-url> /home/matrix-ai
   cd /home/matrix-ai
   ```

2. **Set up environment variables**
   ```bash
   # Generate a secure database password
   echo "MATRIX_DB_PASSWORD=$(openssl rand -base64 32)" > .env
   ```

3. **Run the setup script**
   ```bash
   sudo bash setup.sh
   ```

The script will automatically:
- Update system packages
- Install all dependencies (Python, PostgreSQL, nginx, certbot)
- Configure firewall (SSH, HTTPS only)
- Set up PostgreSQL database with secure password
- Install Matrix Synapse in virtual environment
- Configure Synapse with PostgreSQL
- Set up systemd service
- Configure nginx reverse proxy
- Obtain SSL certificates from Let's Encrypt
- Start all services
- Test the installation

### After Installation

1. **Create admin user**
   ```bash
   /opt/matrix/synapse-venv/bin/register_new_matrix_user -c config/matrix-synapse/homeserver.yaml https://matrix.radx.dev
   ```

2. **Test the server**
   - Visit `https://matrix.radx.dev/_matrix/client/versions`
   - Should return JSON with supported Matrix versions

3. **Set up Element Web client** (optional)
   - Deploy Element Web for browser access
   - Configure to point to your homeserver

### Manual Configuration

If you prefer manual setup, follow these guides:
- [VPS-Setup.md](docs/VPS-Setup.md) - Initial server hardening
- [Architecture.md](docs/Architecture.md) - System overview
- [PRD](docs/prds/01-matrix-server.md) - Project requirements

### Configuration Files

All configuration is stored in the repo:
- `config/matrix-synapse/homeserver.yaml` - Synapse configuration
- `config/matrix-synapse.service` - Systemd service
- `config/nginx-matrix.conf` - Nginx reverse proxy
- `.env` - Environment variables (gitignored)

### Security Notes

- Database password is randomly generated and stored in `.env`
- Firewall only allows SSH (22) and HTTPS (443)
- SSL certificates auto-renew via Let's Encrypt
- All services run with minimal privileges

### Troubleshooting

**Service Issues:**
```bash
# Check Matrix service
sudo systemctl status matrix-synapse
sudo journalctl -xeu matrix-synapse

# Check nginx
sudo systemctl status nginx
sudo nginx -t

# Check PostgreSQL
sudo systemctl status postgresql
```

**SSL Issues:**
```bash
# Test SSL manually
sudo certbot renew --dry-run

# Check certificate expiry
sudo certbot certificates
```

**Network Issues:**
```bash
# Check firewall
sudo ufw status

# Test Matrix API
curl https://matrix.radx.dev/_matrix/client/versions
```