-- Add reply support to location chat messages
-- Allows users to reply to specific messages in location-based chats

-- Add reply_to column to reference parent message
ALTER TABLE shout_location_chat_messages 
ADD COLUMN IF NOT EXISTS reply_to UUID REFERENCES shout_location_chat_messages(id) ON DELETE SET NULL;

-- Index for efficient reply lookups
CREATE INDEX IF NOT EXISTS idx_location_chat_messages_reply_to 
ON shout_location_chat_messages(reply_to) 
WHERE reply_to IS NOT NULL;

-- Add delete policy for messages (users can delete their own messages)
CREATE POLICY IF NOT EXISTS "Users can delete their own messages"
ON shout_location_chat_messages FOR DELETE USING (true);

COMMENT ON COLUMN shout_location_chat_messages.reply_to IS 'Reference to the message being replied to';
