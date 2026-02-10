-- Disable links in the official Alien channel to prevent scam links
-- The chat rules system supports role-based permissions:
--   'everyone'  = all users can post links
--   'mods_only' = only admins and moderators can post links
--   'disabled'  = no one can post links (admins still exempt)

-- Create chat rules tables if they don't exist yet
CREATE TABLE IF NOT EXISTS shout_chat_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_type TEXT NOT NULL CHECK (chat_type IN ('channel', 'alpha', 'location', 'group')),
    chat_id TEXT,
    links_allowed TEXT DEFAULT 'everyone' CHECK (links_allowed IN ('everyone', 'mods_only', 'disabled')),
    photos_allowed TEXT DEFAULT 'everyone' CHECK (photos_allowed IN ('everyone', 'mods_only', 'disabled')),
    pixel_art_allowed TEXT DEFAULT 'everyone' CHECK (pixel_art_allowed IN ('everyone', 'mods_only', 'disabled')),
    gifs_allowed TEXT DEFAULT 'everyone' CHECK (gifs_allowed IN ('everyone', 'mods_only', 'disabled')),
    polls_allowed TEXT DEFAULT 'everyone' CHECK (polls_allowed IN ('everyone', 'mods_only', 'disabled')),
    location_sharing_allowed TEXT DEFAULT 'everyone' CHECK (location_sharing_allowed IN ('everyone', 'mods_only', 'disabled')),
    voice_allowed TEXT DEFAULT 'everyone' CHECK (voice_allowed IN ('everyone', 'mods_only', 'disabled')),
    slow_mode_seconds INTEGER DEFAULT 0,
    read_only BOOLEAN DEFAULT false,
    max_message_length INTEGER DEFAULT 0,
    updated_by TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(chat_type, chat_id)
);

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

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access on chat_rules') THEN
        EXECUTE 'CREATE POLICY "Service role full access on chat_rules" ON shout_chat_rules FOR ALL USING (true) WITH CHECK (true)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access on room_bans') THEN
        EXECUTE 'CREATE POLICY "Service role full access on room_bans" ON shout_room_bans FOR ALL USING (true) WITH CHECK (true)';
    END IF;
END $$;

-- Disable links for the Alien channel
-- The channel ID is looked up dynamically from shout_public_channels
INSERT INTO shout_chat_rules (chat_type, chat_id, links_allowed)
SELECT 'channel', id::text, 'disabled'
FROM shout_public_channels
WHERE name = 'Alien' AND is_official = true
ON CONFLICT (chat_type, chat_id) DO UPDATE SET links_allowed = 'disabled', updated_at = NOW();
