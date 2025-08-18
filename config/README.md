# Configuration Directory

This directory contains configuration files for all Matrix AI server components. 

**⚠️ IMPORTANT: All actual configuration files are gitignored for security.**

## Quick Setup

1. **Copy example configs:**
   ```bash
   cp archiver/config.example.yaml archiver/config.yaml
   cp mautrix-whatsapp/config.example.yaml mautrix-whatsapp/config.yaml
   cp matrix-synapse/homeserver.example.yaml matrix-synapse/homeserver.yaml
   ```

2. **Set environment variables:**
   ```bash
   export MATRIX_PASSWORD="your_archiver_bot_password"
   export SUPABASE_URL="https://your-project.supabase.co"
   export SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"
   ```

3. **Customize each config file** according to your setup

4. **Generate bridge registration:**
   ```bash
   cd /home/matrix-ai
   python -m mautrix_whatsapp -g -c config/mautrix-whatsapp/config.yaml -r config/mautrix-whatsapp/registration.yaml
   ```

## Configuration Files

| File | Purpose | Notes |
|------|---------|-------|
| `archiver/config.yaml` | Matrix message archiver | Requires room IDs and Supabase credentials |
| `mautrix-whatsapp/config.yaml` | WhatsApp bridge | Requires separate database |
| `mautrix-whatsapp/registration.yaml` | App service registration | Auto-generated, add to Synapse config |
| `matrix-synapse/homeserver.yaml` | Main Matrix homeserver | Contains signing keys and database config |

## Security Notes

- **Never commit actual config files** - they contain secrets
- **Use environment variables** for sensitive values
- **Generate strong passwords** for all services
- **Keep registration tokens secure**

## Documentation

See `docs/configuration.md` for detailed configuration guide.

## Service Management

Use the provided scripts to manage services:
- `scripts/start-matrix.sh` - Start all services
- `scripts/stop-matrix.sh` - Stop all services
- `scripts/status-matrix.sh` - Check service status