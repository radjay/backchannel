-- Matrix Message and Media Archiving Schema for Supabase
-- This creates the tables for archiving Matrix messages and media files

-- Messages table
CREATE TABLE archived_messages (
    id BIGSERIAL PRIMARY KEY,
    event_id TEXT UNIQUE NOT NULL,
    room_id TEXT NOT NULL,
    sender TEXT NOT NULL,
    timestamp BIGINT NOT NULL,
    message_type TEXT NOT NULL,
    content JSONB NOT NULL,
    thread_id TEXT,
    reply_to_event_id TEXT,
    edited_at TIMESTAMPTZ,
    redacted BOOLEAN DEFAULT FALSE,
    archived_at TIMESTAMPTZ DEFAULT NOW()
);

-- Media files table (linked to messages via event_id)
CREATE TABLE archived_media (
    id BIGSERIAL PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES archived_messages(event_id) ON DELETE CASCADE,
    media_type TEXT NOT NULL,
    original_filename TEXT,
    file_size BIGINT,
    mime_type TEXT,
    matrix_url TEXT NOT NULL,
    storage_bucket TEXT NOT NULL DEFAULT 'matrix-media',
    storage_path TEXT NOT NULL,
    public_url TEXT NOT NULL,
    archived_at TIMESTAMPTZ DEFAULT NOW()
);

-- Room configuration table
CREATE TABLE monitored_rooms (
    id BIGSERIAL PRIMARY KEY,
    room_id TEXT UNIQUE NOT NULL,
    room_name TEXT,
    room_alias TEXT,
    enabled BOOLEAN DEFAULT TRUE,
    last_sync_token TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_messages_room_timestamp ON archived_messages(room_id, timestamp DESC);
CREATE INDEX idx_messages_sender ON archived_messages(sender);
CREATE INDEX idx_media_event_id ON archived_media(event_id);
CREATE INDEX idx_media_storage_path ON archived_media(storage_bucket, storage_path);

-- Create storage bucket for media files
INSERT INTO storage.buckets (id, name, public) VALUES ('matrix-media', 'matrix-media', true);

-- Create storage policy to allow service role access
CREATE POLICY "Service role access" ON storage.objects FOR ALL USING (auth.role() = 'service_role');

-- Comments for documentation
COMMENT ON TABLE archived_messages IS 'Archived Matrix messages from monitored rooms';
COMMENT ON TABLE archived_media IS 'Media files from Matrix messages stored in Supabase Storage';
COMMENT ON TABLE monitored_rooms IS 'Configuration for rooms being monitored for archiving';
COMMENT ON COLUMN archived_media.event_id IS 'Links media file to its source message';
COMMENT ON COLUMN archived_media.storage_path IS 'Path to file in Supabase Storage bucket';
COMMENT ON COLUMN archived_media.public_url IS 'Public CDN URL for accessing the media file';