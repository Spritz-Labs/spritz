-- Allow 'token' chat_type in shout_chat_rules and shout_room_bans (and shout_blocked_words)
-- so Room Rules / Room Settings work for token chats.

-- shout_chat_rules: drop existing check and add new one including 'token'
ALTER TABLE shout_chat_rules
    DROP CONSTRAINT IF EXISTS shout_chat_rules_chat_type_check;

ALTER TABLE shout_chat_rules
    ADD CONSTRAINT shout_chat_rules_chat_type_check
    CHECK (chat_type IN ('channel', 'alpha', 'location', 'group', 'token'));

-- shout_room_bans: same
ALTER TABLE shout_room_bans
    DROP CONSTRAINT IF EXISTS shout_room_bans_chat_type_check;

ALTER TABLE shout_room_bans
    ADD CONSTRAINT shout_room_bans_chat_type_check
    CHECK (chat_type IN ('channel', 'alpha', 'location', 'group', 'token'));

-- shout_blocked_words: allow token so room-level blocked words can apply to token chats (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'shout_blocked_words') THEN
        ALTER TABLE shout_blocked_words DROP CONSTRAINT IF EXISTS shout_blocked_words_chat_type_check;
        ALTER TABLE shout_blocked_words ADD CONSTRAINT shout_blocked_words_chat_type_check
            CHECK (chat_type IN ('channel', 'alpha', 'location', 'group', 'token'));
    END IF;
END $$;
