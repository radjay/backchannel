# Matrix AI Server Configuration Guide

This document describes how to configure the Matrix AI server components.

## Overview

The Matrix AI server consists of several components that need to be configured:

1. **Matrix Synapse** - The core Matrix homeserver
2. **mautrix-whatsapp** - WhatsApp bridge for connecting WhatsApp groups to Matrix rooms
3. **Matrix Archiver** - Archives messages and media to Supabase for AI processing

## Configuration Files

All configuration files are located in the `/config` directory and are **gitignored** for security. Sample configurations are provided as templates.

### Required Environment Variables

Set these in your environment before starting services:

```bash
# Matrix Archiver
export MATRIX_PASSWORD="your_archiver_bot_password"
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"

# mautrix-whatsapp (if using separate database)
export POSTGRES_DB="mautrix_whatsapp"
export POSTGRES_USER="matrix"
export POSTGRES_PASSWORD="your_db_password"
```

## Service Configuration

### 1. Matrix Synapse

**File:** `config/matrix-synapse/homeserver.yaml`

This is the main Matrix homeserver configuration. Key settings:

- `server_name`: Your Matrix domain (e.g., `matrix.radx.dev`)
- `public_baseurl`: External URL for federation
- Database connection settings
- Registration and media settings

**Important:** This file contains sensitive database credentials and signing keys.

### 2. mautrix-whatsapp Bridge

**Files:** 
- `config/mautrix-whatsapp/config.yaml` - Main bridge configuration
- `config/mautrix-whatsapp/registration.yaml` - Auto-generated app service registration

**Key configuration areas:**

#### Database Settings
```yaml
database:
    type: postgres
    uri: postgresql://user:password@localhost/mautrix_whatsapp
```

**Important:** Use a separate database from Synapse to avoid conflicts.

#### Bridge Settings
```yaml
bridge:
    username_template: "whatsapp_{{.}}"
    displayname_template: "{{if .PushName}}{{.PushName}}{{else if .BusinessName}}{{.BusinessName}}{{else}}{{.JID}}{{end}} (WA)"
    
    # Media handling
    direct_media:
        enabled: false  # Use false for proper archiving compatibility
```

#### Homeserver Connection
```yaml
homeserver:
    address: http://localhost:8008
    domain: matrix.radx.dev
```

### 3. Matrix Archiver

**File:** `config/archiver/config.yaml`

Archives Matrix messages and media to Supabase for AI processing.

#### Room Monitoring
```yaml
rooms:
    - room_id: "!roomid:matrix.radx.dev"
      enabled: true
      backfill: true  # Archive historical messages
```

#### Processing Settings
```yaml
processing:
  max_file_size: "100MB"
  supported_types:
    - "m.text"
    - "m.image"
    - "m.video" 
    - "m.audio"
    - "m.file"
```

**Important:** 
- Supabase credentials are loaded from environment variables
- Room IDs must be exact Matrix room identifiers
- The archiver bot must be invited to monitored rooms

## Setup Workflow

1. **Copy sample configs:**
   ```bash
   cp config/archiver/config.example.yaml config/archiver/config.yaml
   cp config/mautrix-whatsapp/config.example.yaml config/mautrix-whatsapp/config.yaml
   ```

2. **Set environment variables** (see above)

3. **Configure each service** according to your setup

4. **Start services in order:**
   ```bash
   ./scripts/start-matrix.sh
   ```

## Service Dependencies

Services must be started in dependency order:

1. **PostgreSQL** database
2. **Matrix Synapse** homeserver  
3. **mautrix-whatsapp** bridge
4. **Matrix Archiver**

The provided scripts handle this automatically.

## Security Notes

- Configuration files contain sensitive credentials and are gitignored
- Always use environment variables for secrets
- Database passwords should be strong and unique
- Service role keys should have minimal required permissions
- Registration tokens should be kept secure

## Troubleshooting

### Bridge Issues
- Check bridge database is separate from Synapse
- Verify homeserver address is accessible
- Ensure registration.yaml is linked in Synapse config

### Archiver Issues  
- Verify bot is invited to monitored rooms
- Check Supabase credentials and permissions
- Ensure room IDs are correct Matrix identifiers

### Service Startup
- Use `./scripts/status-matrix.sh` to check service status
- Check logs in `/home/matrix-ai/logs/` directory
- Verify service dependencies are running

For detailed logs, check individual service log files.