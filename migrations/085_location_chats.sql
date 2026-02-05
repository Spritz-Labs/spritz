-- Location-based Public Chat Rooms
-- Allows users to create chat rooms anchored to real-world places from Google Maps
-- These are public, decentralized chats hosted on Logos/Waku with Supabase sync

-- Main table for location-based chat rooms
CREATE TABLE IF NOT EXISTS shout_location_chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Basic info
    name TEXT NOT NULL,
    description TEXT,
    emoji TEXT DEFAULT '📍',
    
    -- Google Places data
    google_place_id TEXT UNIQUE NOT NULL,
    google_place_name TEXT NOT NULL,
    google_place_types TEXT[], -- Array of place types (e.g., 'restaurant', 'bar', 'cafe')
    google_place_address TEXT,
    google_place_rating DECIMAL(2,1), -- 0.0 to 5.0
    google_place_user_ratings_total INTEGER,
    google_place_price_level INTEGER, -- 0-4 ($ to $$$$)
    google_place_phone TEXT,
    google_place_website TEXT,
    google_place_hours JSONB, -- Opening hours structure from Google
    google_place_photos TEXT[], -- Array of photo references
    
    -- Location data
    latitude DECIMAL(10, 7) NOT NULL,
    longitude DECIMAL(10, 7) NOT NULL,
    formatted_address TEXT,
    
    -- IPFS storage (full Google data backup)
    ipfs_hash TEXT, -- CID from Pinata
    ipfs_url TEXT, -- Gateway URL for access
    
    -- Waku/Logos decentralized messaging
    messaging_type TEXT DEFAULT 'waku' CHECK (messaging_type IN ('standard', 'waku')),
    waku_symmetric_key TEXT, -- Shared encryption key for the channel
    waku_content_topic TEXT, -- Unique content topic for message routing
    
    -- Creator and stats
    creator_address TEXT NOT NULL,
    member_count INTEGER DEFAULT 0,
    message_count INTEGER DEFAULT 0,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false, -- For verified establishments
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    google_data_fetched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Members of location chats
CREATE TABLE IF NOT EXISTS shout_location_chat_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_chat_id UUID NOT NULL REFERENCES shout_location_chats(id) ON DELETE CASCADE,
    user_address TEXT NOT NULL,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notifications_muted BOOLEAN DEFAULT false,
    last_read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(location_chat_id, user_address)
);

-- Messages in location chats (Supabase sync/cache for hybrid messaging)
CREATE TABLE IF NOT EXISTS shout_location_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_chat_id UUID NOT NULL REFERENCES shout_location_chats(id) ON DELETE CASCADE,
    sender_address TEXT NOT NULL,
    content TEXT NOT NULL,
    message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'pixel_art', 'gif', 'location', 'voice')),
    waku_message_id TEXT, -- For deduplication with Waku messages
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_location_chats_place_id ON shout_location_chats(google_place_id);
CREATE INDEX IF NOT EXISTS idx_location_chats_location ON shout_location_chats(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_location_chats_creator ON shout_location_chats(creator_address);
CREATE INDEX IF NOT EXISTS idx_location_chats_types ON shout_location_chats USING GIN(google_place_types);
CREATE INDEX IF NOT EXISTS idx_location_chats_active ON shout_location_chats(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_location_chat_members_user ON shout_location_chat_members(user_address);
CREATE INDEX IF NOT EXISTS idx_location_chat_members_chat ON shout_location_chat_members(location_chat_id);

CREATE INDEX IF NOT EXISTS idx_location_chat_messages_chat ON shout_location_chat_messages(location_chat_id);
CREATE INDEX IF NOT EXISTS idx_location_chat_messages_created ON shout_location_chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_location_chat_messages_waku_id ON shout_location_chat_messages(waku_message_id);

-- Enable RLS
ALTER TABLE shout_location_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE shout_location_chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE shout_location_chat_messages ENABLE ROW LEVEL SECURITY;

-- Policies for location chats
CREATE POLICY "Anyone can view location chats"
ON shout_location_chats FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create location chats"
ON shout_location_chats FOR INSERT WITH CHECK (true);

CREATE POLICY "Creators can update their location chats"
ON shout_location_chats FOR UPDATE USING (true);

-- Policies for location chat members
CREATE POLICY "Anyone can view location chat members"
ON shout_location_chat_members FOR SELECT USING (true);

CREATE POLICY "Users can join location chats"
ON shout_location_chat_members FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can leave location chats"
ON shout_location_chat_members FOR DELETE USING (true);

CREATE POLICY "Users can update their membership"
ON shout_location_chat_members FOR UPDATE USING (true);

-- Policies for location chat messages
CREATE POLICY "Anyone can view location chat messages"
ON shout_location_chat_messages FOR SELECT USING (true);

CREATE POLICY "Members can send messages"
ON shout_location_chat_messages FOR INSERT WITH CHECK (true);

-- Functions to manage counts
CREATE OR REPLACE FUNCTION increment_location_chat_members(chat_uuid UUID)
RETURNS void AS $$
BEGIN
    UPDATE shout_location_chats 
    SET member_count = member_count + 1, updated_at = NOW()
    WHERE id = chat_uuid;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrement_location_chat_members(chat_uuid UUID)
RETURNS void AS $$
BEGIN
    UPDATE shout_location_chats 
    SET member_count = GREATEST(0, member_count - 1), updated_at = NOW()
    WHERE id = chat_uuid;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_location_chat_messages(chat_uuid UUID)
RETURNS void AS $$
BEGIN
    UPDATE shout_location_chats 
    SET message_count = message_count + 1, updated_at = NOW()
    WHERE id = chat_uuid;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE shout_location_chats IS 'Public chat rooms anchored to real-world places from Google Maps';
COMMENT ON COLUMN shout_location_chats.ipfs_hash IS 'IPFS CID containing full Google Places data backup via Pinata';
COMMENT ON COLUMN shout_location_chats.waku_symmetric_key IS 'Shared encryption key for Logos/Waku decentralized messaging';
COMMENT ON COLUMN shout_location_chats.waku_content_topic IS 'Unique content topic for message routing on Waku network';
