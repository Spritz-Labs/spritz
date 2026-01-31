-- Group chat polls (XMTP group id)
CREATE TABLE IF NOT EXISTS shout_group_polls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id TEXT NOT NULL,
    creator_address TEXT NOT NULL,
    question TEXT NOT NULL,
    options JSONB NOT NULL,
    allows_multiple BOOLEAN DEFAULT false,
    ends_at TIMESTAMPTZ,
    is_anonymous BOOLEAN DEFAULT false,
    is_closed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shout_group_poll_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES shout_group_polls(id) ON DELETE CASCADE,
    user_address TEXT NOT NULL,
    option_index INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(poll_id, user_address, option_index)
);

CREATE INDEX IF NOT EXISTS idx_group_polls_group ON shout_group_polls(group_id);
CREATE INDEX IF NOT EXISTS idx_group_polls_created ON shout_group_polls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_group_poll_votes_poll ON shout_group_poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_group_poll_votes_user ON shout_group_poll_votes(user_address);

ALTER TABLE shout_group_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE shout_group_poll_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view group polls" ON shout_group_polls FOR SELECT USING (true);
CREATE POLICY "Authenticated can create group polls" ON shout_group_polls FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can view group poll votes" ON shout_group_poll_votes FOR SELECT USING (true);
CREATE POLICY "Authenticated can vote in group polls" ON shout_group_poll_votes FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can remove their group poll votes" ON shout_group_poll_votes FOR DELETE USING (true);
