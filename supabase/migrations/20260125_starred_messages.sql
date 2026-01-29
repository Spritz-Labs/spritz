-- Starred/Saved Messages Table
CREATE TABLE IF NOT EXISTS starred_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_address TEXT NOT NULL,
    message_id TEXT NOT NULL,
    message_type TEXT NOT NULL CHECK (message_type IN ('channel', 'dm', 'group', 'alpha')),
    -- Denormalized data for quick access
    content TEXT NOT NULL,
    sender_address TEXT NOT NULL,
    sender_name TEXT,
    -- Context info
    channel_id UUID REFERENCES channels(id) ON DELETE SET NULL,
    channel_name TEXT,
    peer_address TEXT,
    peer_name TEXT,
    group_id TEXT,
    group_name TEXT,
    -- Metadata
    original_created_at TIMESTAMPTZ NOT NULL,
    starred_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT, -- User can add notes to starred messages
    UNIQUE(user_address, message_id)
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_starred_messages_user ON starred_messages(user_address);
CREATE INDEX IF NOT EXISTS idx_starred_messages_starred_at ON starred_messages(starred_at DESC);
CREATE INDEX IF NOT EXISTS idx_starred_messages_type ON starred_messages(message_type);

-- RLS Policies
ALTER TABLE starred_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own starred messages"
    ON starred_messages FOR SELECT
    USING (true);

CREATE POLICY "Users can star messages"
    ON starred_messages FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Users can unstar messages"
    ON starred_messages FOR DELETE
    USING (true);

-- Add forwarded_from column to channel_messages if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'channel_messages' 
        AND column_name = 'forwarded_from'
    ) THEN
        ALTER TABLE channel_messages ADD COLUMN forwarded_from JSONB;
        -- forwarded_from structure: { original_sender: string, original_channel: string, original_created_at: string }
    END IF;
END $$;

-- Add location column to channel_messages for location sharing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'channel_messages' 
        AND column_name = 'location'
    ) THEN
        ALTER TABLE channel_messages ADD COLUMN location JSONB;
        -- location structure: { lat: number, lng: number, name?: string, address?: string }
    END IF;
END $$;
