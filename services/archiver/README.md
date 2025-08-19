# Matrix Archiver

Unified Matrix to Supabase archiver with dynamic room management.

## Features

- **Dynamic Room Management**: Automatically monitors rooms based on database configuration
- **Auto-join**: Automatically accepts invitations and joins rooms when possible
- **Media Archiving**: Downloads and stores media files to Supabase Storage
- **Rate Limiting**: Handles Matrix rate limits gracefully
- **Database-driven**: Uses monitored_rooms table to control which rooms are archived

## Quick Start

```bash
# Start the unified archiver
python3 src/archiver/unified_archiver.py
```

## Room Management

The archiver monitors the `monitored_rooms` table and automatically:
- Joins new rooms when they're added to the database
- Leaves rooms when they're disabled in the database
- Provides helpful tips for private rooms that require manual invitation

## Auto-invitation for Private Rooms

Since Matrix's security model prevents automatic joining of private rooms, use these tools for manual invitation:

```bash
# For a specific room (requires admin to join room first)
python3 auto_invite_archiver.py !roomid:matrix.radx.dev

# Using admin API (requires server admin privileges)
python3 admin_api_invite.py !roomid:matrix.radx.dev
```

## Manual Room Addition Workflow

1. Add room to monitored_rooms table in Supabase
2. Set `enabled=true` and `auto_join=true`
3. For private rooms: Run invitation script manually
4. Archiver will detect and start monitoring within 5 minutes

## Environment Variables

Set these in `/home/matrix-ai/config/archiver/env`:
- `MATRIX_PASSWORD`: Password for @archiver:matrix.radx.dev
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key
- `MATRIX_ADMIN_USERNAME`: Admin username for invitation scripts
- `MATRIX_ADMIN_PASSWORD`: Admin password for invitation scripts

## Database Schema

The archiver uses these updated table names:
- `messages` (was `archived_messages`)
- `media` (was `archived_media`)  
- `monitored_rooms` (controls which rooms to archive)