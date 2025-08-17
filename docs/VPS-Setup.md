# VPS Setup for Matrix Server

## Initial VPS Configuration

### System Requirements
- Ubuntu 25.04 (or compatible Debian-based system)
- Minimum 2GB RAM, 4GB recommended
- 50GB+ storage
- Python 3.8+ (Ubuntu 25.04 has Python 3.13)

### 1. Initial System Update
```bash
apt update && apt upgrade -y
```

### 2. Firewall Configuration
Configure UFW to allow only necessary ports:

```bash
# Allow SSH (port 22)
ufw allow 22/tcp comment 'SSH'

# Allow HTTPS for Matrix (port 443)
ufw allow 443/tcp comment 'HTTPS Matrix'

# Enable firewall
ufw --force enable

# Verify configuration
ufw status numbered
```

Expected output:
```
Status: active

     To                         Action      From
     --                         ------      ----
[ 1] 22/tcp                     ALLOW IN    Anywhere                   # SSH
[ 2] 443/tcp                    ALLOW IN    Anywhere                   # HTTPS Matrix
[ 3] 22/tcp (v6)                ALLOW IN    Anywhere (v6)              # SSH
[ 4] 443/tcp (v6)               ALLOW IN    Anywhere (v6)              # HTTPS Matrix
```

### 3. SSH Key Authentication (Recommended)
If not already configured:

```bash
# On your local machine, generate SSH key pair
ssh-keygen -t ed25519 -C "your-email@example.com"

# Copy public key to server
ssh-copy-id user@your-vps-ip

# On server, disable password authentication (optional but recommended)
sudo sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

### 4. DNS Configuration
Ensure your domain points to the VPS:

```bash
# A record
matrix.radx.dev → YOUR_VPS_IP

# Verify DNS propagation
dig matrix.radx.dev
nslookup matrix.radx.dev
```

### 5. Basic Security Hardening
```bash
# Install fail2ban for SSH protection
apt install -y fail2ban

# Configure automatic security updates
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
```

## Next Steps
After completing this setup, proceed with Matrix Synapse installation as documented in the main deployment process.