-- Blocked Words System for Anti-Scam Protection
-- Supports global (platform-wide) and per-room blocked words/phrases

CREATE TABLE IF NOT EXISTS shout_blocked_words (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    word TEXT NOT NULL,
    scope TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'room')),
    chat_type TEXT CHECK (chat_type IN ('channel', 'alpha', 'location', 'group')),
    chat_id TEXT,
    action TEXT NOT NULL DEFAULT 'block' CHECK (action IN ('block', 'flag', 'mute')),
    is_regex BOOLEAN DEFAULT false,
    added_by TEXT NOT NULL,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true
);

-- Unique index: prevent duplicate words per scope/room
CREATE UNIQUE INDEX IF NOT EXISTS idx_blocked_words_unique
    ON shout_blocked_words(LOWER(word), scope, COALESCE(chat_type, '__none__'), COALESCE(chat_id, '__global__'))
    WHERE is_active = true;

-- Fast lookup for global blocked words
CREATE INDEX IF NOT EXISTS idx_blocked_words_global
    ON shout_blocked_words(scope, is_active)
    WHERE scope = 'global' AND is_active = true;

-- Fast lookup for room-specific blocked words
CREATE INDEX IF NOT EXISTS idx_blocked_words_room
    ON shout_blocked_words(chat_type, chat_id, is_active)
    WHERE scope = 'room' AND is_active = true;

ALTER TABLE shout_blocked_words ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on blocked_words"
    ON shout_blocked_words FOR ALL USING (true) WITH CHECK (true);
