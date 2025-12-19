# PRD 06: Database-Based Message Archiver

**Status:** Draft
**Created:** December 19, 2025
**Author:** Team
**Related:** [03-message-archiving.md](./03-message-archiving.md), [whatsapp-bridge-archiver-analysis.md](../whatsapp-bridge-archiver-analysis.md)

---

## Problem Statement

The current archiver (`archiver-js`) operates as a Matrix bot that must be a member of each bridged room to receive messages via the Matrix sync API. This creates a critical issue:

**The mautrix-whatsapp bridge's "portal resync" feature periodically removes non-WhatsApp users from bridged rooms**, including the archiver bot. When a message is received in a bridged room, the bridge schedules a resync ~2.5 hours later, which compares Matrix room members against WhatsApp group participants and removes any Matrix-only users.

This results in:
- Archiver bot repeatedly kicked from rooms with reason "User is not in remote chat"
- Missed messages during periods when the bot is removed
- Manual intervention required to re-invite the bot
- Unreliable message archiving

See [whatsapp-bridge-archiver-analysis.md](../whatsapp-bridge-archiver-analysis.md) for detailed root cause analysis.

---

## Proposed Solution

**Migrate to a database-based archiver** that reads messages directly from the source databases rather than requiring Matrix room membership.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Data Sources                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────┐       ┌─────────────────────┐          │
│  │  mautrix_whatsapp   │       │      synapse        │          │
│  │    (PostgreSQL)     │       │    (PostgreSQL)     │          │
│  │                     │       │                     │          │
│  │  • message          │       │  • event_json       │          │
│  │  • portal           │       │  • room_memberships │          │
│  │  • ghost            │       │  • media_repository │          │
│  └──────────┬──────────┘       └──────────┬──────────┘          │
│             │                             │                     │
│             └──────────────┬──────────────┘                     │
│                            │                                    │
│                            ▼                                    │
│               ┌────────────────────────┐                        │
│               │   Database Archiver    │                        │
│               │      (New Service)     │                        │
│               │                        │                        │
│               │  • Polls for new msgs  │                        │
│               │  • Joins data sources  │                        │
│               │  • Downloads media     │                        │
│               │  • Stores to Supabase  │                        │
│               └───────────┬────────────┘                        │
│                           │                                     │
│                           ▼                                     │
│               ┌────────────────────────┐                        │
│               │       Supabase         │                        │
│               │  • messages            │                        │
│               │  • media               │                        │
│               │  • analysis_jobs       │                        │
│               └────────────────────────┘                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Sources

### 1. mautrix_whatsapp Database

The WhatsApp bridge maintains message metadata:

**`message` table:**
| Column | Type | Description |
|--------|------|-------------|
| rowid | bigint | Auto-increment primary key |
| id | text | WhatsApp message ID (e.g., `group@g.us:sender@lid:msgid`) |
| mxid | text | Matrix event ID (e.g., `$abc123:matrix.radx.dev`) |
| room_id | text | WhatsApp chat ID |
| sender_id | text | WhatsApp sender ID |
| sender_mxid | text | Matrix sender ID |
| timestamp | bigint | Unix timestamp (nanoseconds) |
| metadata | jsonb | Additional message metadata |

**`portal` table:**
| Column | Type | Description |
|--------|------|-------------|
| id | text | WhatsApp chat ID |
| mxid | text | Matrix room ID |
| name | text | Chat/group name |
| room_type | text | Type (dm, group, etc.) |

**`ghost` table:**
| Column | Type | Description |
|--------|------|-------------|
| id | text | WhatsApp user ID |
| name | text | Display name |
| identifiers | jsonb | Phone numbers, etc. |

### 2. Synapse Database

Matrix server stores actual message content:

**`event_json` table:**
| Column | Type | Description |
|--------|------|-------------|
| event_id | text | Matrix event ID |
| json | text | Full event JSON including content |

**Media:**
- Media files stored in `/home/matrix-ai/data/media_store/`
- Referenced by `mxc://` URLs in message content

---

## Implementation Plan

### Phase 1: Database Poller Service

Create a new service that polls the mautrix_whatsapp database for new messages.

**Components:**
1. **Message Poller**
   - Query `message` table for rows with `timestamp > last_processed`
   - Track last processed timestamp in state file or database
   - Poll interval: 5-10 seconds (configurable)

2. **Content Enrichment**
   - Join with `portal` table for room metadata
   - Join with `ghost` table for sender info
   - Query Synapse `event_json` for message content using `mxid`

3. **Message Processing**
   - Parse message content from Matrix event JSON
   - Extract media URLs (mxc://)
   - Store enriched message to Supabase `messages` table

**Pseudocode:**
```typescript
async function pollMessages() {
  const lastTimestamp = await getLastProcessedTimestamp();

  const newMessages = await db.query(`
    SELECT m.*, p.name as room_name, g.name as sender_name
    FROM message m
    JOIN portal p ON m.room_id = p.id
    JOIN ghost g ON m.sender_id = g.id
    WHERE m.timestamp > $1
    ORDER BY m.timestamp ASC
    LIMIT 100
  `, [lastTimestamp]);

  for (const msg of newMessages) {
    // Get content from Synapse
    const event = await synapse.query(`
      SELECT json FROM event_json WHERE event_id = $1
    `, [msg.mxid]);

    const content = JSON.parse(event.json).content;

    // Store to Supabase
    await supabase.from('messages').upsert({
      event_id: msg.mxid,
      room_id: msg.room_id,
      room_name: msg.room_name,
      sender: msg.sender_mxid,
      sender_display_name: msg.sender_name,
      timestamp: new Date(msg.timestamp / 1000000),
      message_type: content.msgtype,
      content: content
    });

    // Handle media if present
    if (hasMedia(content)) {
      await processMedia(msg, content);
    }

    await updateLastProcessedTimestamp(msg.timestamp);
  }
}
```

### Phase 2: Media Handling

**Current Approach (archiver-js):**
1. Detect media in message content
2. Download from Matrix via `/_matrix/media/v3/download`
3. Upload to Supabase Storage
4. Create `analysis_jobs` entry

**New Approach:**
1. Detect media URLs (`mxc://`) in Synapse event content
2. Read directly from file system: `/home/matrix-ai/data/media_store/`
3. Upload to Supabase Storage
4. Create `analysis_jobs` entry

**Media Path Resolution:**
```typescript
function resolveMediaPath(mxcUrl: string): string {
  // mxc://matrix.radx.dev/ABCxyz123
  const [, server, mediaId] = mxcUrl.match(/mxc:\/\/([^/]+)\/(.+)/);

  // Synapse stores media in: media_store/local_content/XX/YY/ABCxyz123
  const prefix = mediaId.substring(0, 2);
  const suffix = mediaId.substring(2, 4);

  return `/home/matrix-ai/data/media_store/local_content/${prefix}/${suffix}/${mediaId}`;
}
```

### Phase 3: Room Configuration

**Current:** `monitored_rooms` table with room_id, enabled, archive_media flags

**New:** Extend to support WhatsApp chat IDs:

```sql
ALTER TABLE monitored_rooms ADD COLUMN whatsapp_id TEXT;
ALTER TABLE monitored_rooms ADD COLUMN bridge_type TEXT DEFAULT 'whatsapp';

-- Index for efficient lookups
CREATE INDEX idx_monitored_rooms_whatsapp ON monitored_rooms(whatsapp_id) WHERE whatsapp_id IS NOT NULL;
```

**Auto-discovery option:**
- Query `portal` table for all bridged rooms
- Optionally auto-enable archiving for new rooms

### Phase 4: Deprecate Bot-Based Archiver

1. Stop `archiver-js` service
2. Remove archiver bot from rooms (optional, will be auto-removed anyway)
3. Update npm scripts to use new service
4. Archive old service code

---

## Database Views (Optional)

Create views to simplify querying across databases:

```sql
-- In mautrix_whatsapp database
CREATE VIEW v_messages_enriched AS
SELECT
  m.rowid,
  m.id as whatsapp_id,
  m.mxid as matrix_event_id,
  m.room_id as whatsapp_room_id,
  p.mxid as matrix_room_id,
  p.name as room_name,
  m.sender_id as whatsapp_sender_id,
  m.sender_mxid as matrix_sender_id,
  g.name as sender_name,
  g.identifiers as sender_identifiers,
  to_timestamp(m.timestamp / 1000000000) as message_time,
  m.metadata
FROM message m
JOIN portal p ON m.room_id = p.id AND m.bridge_id = p.bridge_id
JOIN ghost g ON m.sender_id = g.id AND m.bridge_id = g.bridge_id;
```

---

## Configuration

**Environment Variables:**
```bash
# Database connections
WHATSAPP_DB_URL=postgres://matrix:xxx@localhost/mautrix_whatsapp
SYNAPSE_DB_URL=postgres://synapse:xxx@localhost/synapse
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=xxx

# Polling
POLL_INTERVAL_MS=5000
BATCH_SIZE=100

# Media
MEDIA_STORE_PATH=/home/matrix-ai/data/media_store
DOWNLOAD_MEDIA=true

# Rooms (optional, empty = all rooms)
MONITORED_ROOMS=room1_id,room2_id
```

---

## Migration Steps

### Step 1: Create New Service
```bash
mkdir -p /home/matrix-ai/services/archiver-db
cd /home/matrix-ai/services/archiver-db
npm init -y
npm install pg @supabase/supabase-js dotenv
```

### Step 2: Database Access
```sql
-- Grant read access to archiver service
CREATE USER archiver WITH PASSWORD 'xxx';
GRANT CONNECT ON DATABASE mautrix_whatsapp TO archiver;
GRANT CONNECT ON DATABASE synapse TO archiver;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO archiver;
```

### Step 3: Backfill Historical Data
```typescript
// One-time backfill of existing messages
async function backfill() {
  const messages = await db.query(`
    SELECT * FROM message ORDER BY timestamp ASC
  `);

  for (const msg of messages) {
    await processMessage(msg);
  }
}
```

### Step 4: Transition
1. Run new archiver in parallel with old for validation
2. Compare message counts between systems
3. Disable old archiver once validated
4. Update systemd service

---

## Success Criteria

1. **No room membership required** - Archiver functions without being in Matrix rooms
2. **No missed messages** - All WhatsApp messages captured
3. **Latency < 30 seconds** - Messages archived within 30s of receipt
4. **Media handling** - All media types (image, video, audio, files) captured
5. **Backward compatible** - Same Supabase schema, analyzer continues to work

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Database schema changes in bridge updates | High | Pin bridge version, monitor changelogs |
| Performance impact on bridge DB | Medium | Read-only queries, connection pooling |
| Synapse DB access complexity | Medium | Document access patterns, create views |
| Message content not in bridge DB | High | Must query Synapse DB for content |

---

## Timeline Estimate

| Phase | Effort | Description |
|-------|--------|-------------|
| Phase 1 | 2-3 days | Database poller, basic message capture |
| Phase 2 | 1-2 days | Media handling |
| Phase 3 | 1 day | Room configuration |
| Phase 4 | 1 day | Deprecation & cleanup |
| Testing | 1-2 days | Validation & parallel run |

**Total: ~1-2 weeks**

---

## Appendix: Current Archiver Architecture

For reference, the current `archiver-js` service:

- **Location:** `/home/matrix-ai/services/archiver-js/`
- **Language:** TypeScript
- **Approach:** Matrix sync API polling
- **Authentication:** Password login as `@archiver:matrix.radx.dev`
- **Dependencies:** Matrix room membership

The new database-based approach eliminates the Matrix authentication and room membership requirements entirely.
