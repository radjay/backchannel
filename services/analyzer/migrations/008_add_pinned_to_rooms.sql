-- Add pinned column to monitored_rooms table
ALTER TABLE monitored_rooms ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT FALSE;

-- Create index for efficient sorting by pinned status
CREATE INDEX IF NOT EXISTS idx_monitored_rooms_pinned ON monitored_rooms(pinned DESC, room_name ASC);
