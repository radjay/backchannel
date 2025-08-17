# Matrix Message Archiver for Supabase

A Python service that archives Matrix room messages and media files to Supabase (PostgreSQL + Storage).

## Features

- Archives all Matrix messages to Supabase PostgreSQL
- Downloads and stores media files in Supabase Storage
- Maintains message-to-media relationships via foreign keys
- Supports room monitoring configuration
- Historical message backfilling
- Automatic retry logic and error handling

## Installation

1. Install Python dependencies:
```bash
cd /home/matrix-ai/services/archiver
pip3 install -r requirements.txt
```

2. Set up Supabase database:
```bash
# Run the migration script in your Supabase SQL editor
cat migrations/001_initial_schema.sql
```

3. Configure the service:
```bash
# Copy and edit configuration
cp config/archiver.yaml /home/matrix-ai/config/archiver/config.yaml
# Edit with your settings
```

4. Set up environment variables:
```bash
export MATRIX_PASSWORD="your_archiver_bot_password"
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"
export SUPABASE_ANON_KEY="your_anon_key"
export SUPABASE_JWT_SECRET="your_jwt_secret"
export SUPABASE_DB_URL="postgresql://postgres:password@db.your-project.supabase.co:5432/postgres"
```

5. Install as systemd service:
```bash
# Edit environment variables in the service file
sudo cp matrix-archiver.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable matrix-archiver
sudo systemctl start matrix-archiver
```

## Configuration

### Matrix Settings
- Create a dedicated archiver bot account on your Matrix server
- Add the bot to rooms you want to archive
- Configure credentials in config.yaml or environment variables

### Supabase Settings
- Create a new Supabase project
- Run the database migration script
- Configure storage bucket permissions
- Set environment variables with your project credentials

### Room Configuration
Add rooms to monitor in config.yaml:
```yaml
rooms:
  - room_id: "!example:matrix.radx.dev"
    enabled: true
    backfill: true  # Backfill historical messages
  - room_id: "!whatsapp_bridge:matrix.radx.dev"
    enabled: true
    backfill: false  # Only archive new messages
```

## Usage

### Manual Testing
```bash
cd /home/matrix-ai/services/archiver
python3 -m src.archiver.main
```

### Service Management
```bash
# Start service
sudo systemctl start matrix-archiver

# Check status
sudo systemctl status matrix-archiver

# View logs
journalctl -u matrix-archiver -f

# Stop service
sudo systemctl stop matrix-archiver
```

## Database Schema

### Tables
- `archived_messages`: All Matrix messages with content and metadata
- `archived_media`: Media files linked to messages via event_id
- `monitored_rooms`: Configuration for rooms being archived

### Key Relationships
- Media files are linked to messages via foreign key on event_id
- Cascade delete ensures cleanup when messages are removed
- Indexes optimize queries by room, timestamp, and sender

## Monitoring

### Logs
- Service logs to systemd journal
- Additional logs in `/home/matrix-ai/logs/archiver.log`
- Configurable log levels (DEBUG, INFO, WARNING, ERROR)

### Health Checks
- Service automatically restarts on failure
- Retry logic for temporary network issues
- Connection pool monitoring for database health

## Troubleshooting

### Common Issues
1. **Authentication Error**: Check Matrix password and Supabase credentials
2. **Room Access**: Ensure archiver bot is invited to rooms
3. **Storage Permissions**: Verify Supabase bucket policies
4. **Database Connection**: Check Supabase database URL and connectivity

### Debug Mode
Set log level to DEBUG in config.yaml for verbose logging:
```yaml
log_level: "DEBUG"
```