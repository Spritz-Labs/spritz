-- Alpha (global) chat polls
CREATE TABLE IF NOT EXISTS shout_alpha_polls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

CREATE TABLE IF NOT EXISTS shout_alpha_poll_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES shout_alpha_polls(id) ON DELETE CASCADE,
    user_address TEXT NOT NULL,
    option_index INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(poll_id, user_address, option_index)
);

CREATE INDEX IF NOT EXISTS idx_alpha_polls_created ON shout_alpha_polls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alpha_poll_votes_poll ON shout_alpha_poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_alpha_poll_votes_user ON shout_alpha_poll_votes(user_address);

ALTER TABLE shout_alpha_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE shout_alpha_poll_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view alpha polls" ON shout_alpha_polls FOR SELECT USING (true);
CREATE POLICY "Authenticated can create alpha polls" ON shout_alpha_polls FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can view alpha poll votes" ON shout_alpha_poll_votes FOR SELECT USING (true);
CREATE POLICY "Authenticated can vote in alpha polls" ON shout_alpha_poll_votes FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can remove their alpha poll votes" ON shout_alpha_poll_votes FOR DELETE USING (true);
