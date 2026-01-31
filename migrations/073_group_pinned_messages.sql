-- Group chat pinned messages (XMTP group id + message id from client)
CREATE TABLE IF NOT EXISTS shout_group_pinned_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    pinned_by TEXT NOT NULL,
    pinned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_group_pins_group ON shout_group_pinned_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_group_pins_pinned_at ON shout_group_pinned_messages(group_id, pinned_at DESC);

ALTER TABLE shout_group_pinned_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view group pins"
    ON shout_group_pinned_messages FOR SELECT USING (true);

CREATE POLICY "Authenticated can pin in group"
    ON shout_group_pinned_messages FOR INSERT WITH CHECK (true);

CREATE POLICY "Pinner can unpin"
    ON shout_group_pinned_messages FOR DELETE USING (true);
