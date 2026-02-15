-- Token-Gated Chats
-- Allows users to create chat rooms that require holding a minimum amount of an ERC20 token

-- 1. Token Chats Table
CREATE TABLE IF NOT EXISTS shout_token_chats (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_by TEXT NOT NULL,
    -- Token details
    token_address TEXT NOT NULL,
    token_chain_id INTEGER NOT NULL,
    token_name TEXT,
    token_symbol TEXT,
    token_decimals INTEGER DEFAULT 18,
    token_image TEXT,
    -- Requirements
    min_balance TEXT NOT NULL DEFAULT '0',  -- stored as raw token units (big number string)
    min_balance_display TEXT,               -- human-readable (e.g. "1000")
    -- Official status
    is_official BOOLEAN DEFAULT false,      -- true if creator is deployer/owner (Ownable)
    -- Chat settings
    description TEXT,
    emoji TEXT DEFAULT '🪙',
    member_count INTEGER DEFAULT 0,
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_chats_created_by ON shout_token_chats(created_by);
CREATE INDEX IF NOT EXISTS idx_token_chats_token ON shout_token_chats(token_address, token_chain_id);
CREATE INDEX IF NOT EXISTS idx_token_chats_chain ON shout_token_chats(token_chain_id);

-- 2. Token Chat Members Table
CREATE TABLE IF NOT EXISTS shout_token_chat_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    chat_id TEXT NOT NULL REFERENCES shout_token_chats(id) ON DELETE CASCADE,
    member_address TEXT NOT NULL,
    role TEXT DEFAULT 'member',           -- 'admin', 'moderator', or 'member'
    verified_balance TEXT,                -- last verified balance
    verified_at TIMESTAMP WITH TIME ZONE, -- when balance was last verified
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(chat_id, member_address)
);

CREATE INDEX IF NOT EXISTS idx_token_chat_members_chat ON shout_token_chat_members(chat_id);
CREATE INDEX IF NOT EXISTS idx_token_chat_members_member ON shout_token_chat_members(member_address);

-- 3. Token Chat Messages Table (server-stored, not E2E encrypted)
CREATE TABLE IF NOT EXISTS shout_token_chat_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    chat_id TEXT NOT NULL REFERENCES shout_token_chats(id) ON DELETE CASCADE,
    sender_address TEXT NOT NULL,
    content TEXT NOT NULL,
    reply_to UUID REFERENCES shout_token_chat_messages(id) ON DELETE SET NULL,
    edited_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_chat_messages_chat ON shout_token_chat_messages(chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_chat_messages_sender ON shout_token_chat_messages(sender_address);

-- 4. Enable RLS
ALTER TABLE shout_token_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE shout_token_chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE shout_token_chat_messages ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
CREATE POLICY "Allow all on token_chats" ON shout_token_chats FOR ALL USING (true);
CREATE POLICY "Allow all on token_chat_members" ON shout_token_chat_members FOR ALL USING (true);
CREATE POLICY "Allow all on token_chat_messages" ON shout_token_chat_messages FOR ALL USING (true);

-- 6. Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE shout_token_chats;
ALTER PUBLICATION supabase_realtime ADD TABLE shout_token_chat_messages;

-- 7. Function to update member count
CREATE OR REPLACE FUNCTION update_token_chat_member_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE shout_token_chats SET member_count = member_count + 1, updated_at = NOW() WHERE id = NEW.chat_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE shout_token_chats SET member_count = member_count - 1, updated_at = NOW() WHERE id = OLD.chat_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER token_chat_member_count_trigger
AFTER INSERT OR DELETE ON shout_token_chat_members
FOR EACH ROW EXECUTE FUNCTION update_token_chat_member_count();

SELECT 'Token-gated chats migration complete!' as status;
