-- Channel Message Editing/Deleting Support
-- Adds is_edited, edited_at, and is_deleted columns to channel messages

-- Add editing columns
ALTER TABLE shout_channel_messages 
ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT false;

ALTER TABLE shout_channel_messages 
ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE shout_channel_messages 
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;

-- Index for filtering deleted messages if needed
CREATE INDEX IF NOT EXISTS idx_channel_messages_deleted ON shout_channel_messages(is_deleted) WHERE is_deleted = true;

SELECT 'Channel message editing migration complete!' as status;
