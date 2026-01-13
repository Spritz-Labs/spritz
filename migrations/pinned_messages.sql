-- Pinned Messages Migration
-- Allows admins to pin messages in public channels

-- Add pinned columns to channel messages
ALTER TABLE shout_channel_messages 
ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS pinned_by TEXT,
ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMP WITH TIME ZONE;

-- Index for efficient pinned message queries
CREATE INDEX IF NOT EXISTS idx_channel_messages_pinned 
ON shout_channel_messages(channel_id, is_pinned) 
WHERE is_pinned = true;

-- Done!
SELECT 'Pinned messages migration complete!' as status;
