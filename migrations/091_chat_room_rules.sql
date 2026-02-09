-- Chat Room Rules & Room-Level Bans
-- Applied via Supabase dashboard migration

-- Chat Room Rules table
CREATE TABLE IF NOT EXISTS shout_chat_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_type TEXT NOT NULL CHECK (chat_type IN ('channel', 'alpha', 'location', 'group')),
    chat_id TEXT,
    links_allowed BOOLEAN DEFAULT true,
    photos_allowed BOOLEAN DEFAULT true,
    pixel_art_allowed BOOLEAN DEFAULT true,
    gifs_allowed BOOLEAN DEFAULT true,
    polls_allowed BOOLEAN DEFAULT true,
    location_sharing_allowed BOOLEAN DEFAULT true,
    voice_allowed BOOLEAN DEFAULT true,
    slow_mode_seconds INTEGER DEFAULT 0,
    read_only BOOLEAN DEFAULT false,
    max_message_length INTEGER DEFAULT 0,
    updated_by TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(chat_type, chat_id)
);

-- Room-level bans table
CREATE TABLE IF NOT EXISTS shout_room_bans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_type TEXT NOT NULL CHECK (chat_type IN ('channel', 'alpha', 'location', 'group')),
    chat_id TEXT,
    user_address TEXT NOT NULL,
    banned_by TEXT NOT NULL,
    reason TEXT,
    banned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    banned_until TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_room_bans_unique
    ON shout_room_bans(chat_type, COALESCE(chat_id, '__global__'), user_address) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_chat_rules_lookup ON shout_chat_rules(chat_type, chat_id);
CREATE INDEX IF NOT EXISTS idx_room_bans_lookup ON shout_room_bans(chat_type, chat_id, user_address, is_active);
CREATE INDEX IF NOT EXISTS idx_room_bans_user ON shout_room_bans(user_address, is_active);

ALTER TABLE shout_chat_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE shout_room_bans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on chat_rules"
    ON shout_chat_rules FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on room_bans"
    ON shout_room_bans FOR ALL USING (true) WITH CHECK (true);

INSERT INTO shout_chat_rules (chat_type, chat_id)
VALUES ('alpha', NULL)
ON CONFLICT (chat_type, chat_id) DO NOTHING;
