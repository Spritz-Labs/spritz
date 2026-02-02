-- Pinned chats (pin to top of list) per user
CREATE TABLE IF NOT EXISTS shout_chat_pinned (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_address TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_address, chat_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_pinned_user ON shout_chat_pinned(user_address);

ALTER TABLE shout_chat_pinned ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own pinned chats" ON shout_chat_pinned
    FOR SELECT USING (true);

CREATE POLICY "Users can insert their own pinned chats" ON shout_chat_pinned
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their own pinned chats" ON shout_chat_pinned
    FOR UPDATE USING (true);

CREATE POLICY "Users can delete their own pinned chats" ON shout_chat_pinned
    FOR DELETE USING (true);
