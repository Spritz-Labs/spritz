-- Add Waku/Logos messaging support for public channels

-- Add messaging_type column (standard = Supabase, waku = decentralized Logos/Waku)
ALTER TABLE shout_public_channels 
ADD COLUMN IF NOT EXISTS messaging_type TEXT DEFAULT 'standard' CHECK (messaging_type IN ('standard', 'waku'));

-- For Waku channels, store the symmetric encryption key (shared with all members)
-- This allows "public" channels where anyone can join and get the key
ALTER TABLE shout_public_channels 
ADD COLUMN IF NOT EXISTS waku_symmetric_key TEXT;

-- Store the Waku content topic for this channel (unique identifier for message routing)
ALTER TABLE shout_public_channels 
ADD COLUMN IF NOT EXISTS waku_content_topic TEXT;

-- Index for finding Waku channels
CREATE INDEX IF NOT EXISTS idx_channels_messaging_type ON shout_public_channels(messaging_type);

-- Create table for Waku channel messages
-- This serves as a bridge/cache while we prepare for full Waku decentralization
CREATE TABLE IF NOT EXISTS shout_waku_channel_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES shout_public_channels(id) ON DELETE CASCADE,
    content_topic TEXT NOT NULL,
    sender_address TEXT NOT NULL,
    content TEXT NOT NULL,
    message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'pixel_art', 'gif')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- For future: Waku message ID for deduplication
    waku_message_id TEXT
);

-- Indexes for Waku messages
CREATE INDEX IF NOT EXISTS idx_waku_messages_channel ON shout_waku_channel_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_waku_messages_created ON shout_waku_channel_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_waku_messages_topic ON shout_waku_channel_messages(content_topic);

-- Enable RLS
ALTER TABLE shout_waku_channel_messages ENABLE ROW LEVEL SECURITY;

-- Anyone can read Waku channel messages (they're public channels)
CREATE POLICY "Anyone can view waku channel messages"
ON shout_waku_channel_messages FOR SELECT USING (true);

-- Members can insert messages (verified in API)
CREATE POLICY "Members can insert waku channel messages"
ON shout_waku_channel_messages FOR INSERT WITH CHECK (true);

-- Comment explaining the design
COMMENT ON COLUMN shout_public_channels.messaging_type IS 'standard = Supabase storage, waku = decentralized Logos/Waku messaging';
COMMENT ON COLUMN shout_public_channels.waku_symmetric_key IS 'For Waku channels: shared encryption key (base64 encoded). Anyone who joins gets this key.';
COMMENT ON COLUMN shout_public_channels.waku_content_topic IS 'For Waku channels: unique content topic for message routing';
