-- Channel Polls
-- Allows users to create polls in channels

-- Polls table
CREATE TABLE IF NOT EXISTS shout_channel_polls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES shout_public_channels(id) ON DELETE CASCADE,
    creator_address TEXT NOT NULL,
    question TEXT NOT NULL,
    options JSONB NOT NULL, -- Array of option strings
    allows_multiple BOOLEAN DEFAULT false,
    ends_at TIMESTAMP WITH TIME ZONE, -- NULL = no end time
    is_anonymous BOOLEAN DEFAULT false,
    is_closed BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Poll votes table
CREATE TABLE IF NOT EXISTS shout_channel_poll_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES shout_channel_polls(id) ON DELETE CASCADE,
    user_address TEXT NOT NULL,
    option_index INTEGER NOT NULL, -- Index of the option they voted for
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(poll_id, user_address, option_index) -- Prevent duplicate votes for same option
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_channel_polls_channel ON shout_channel_polls(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_polls_creator ON shout_channel_polls(creator_address);
CREATE INDEX IF NOT EXISTS idx_channel_polls_created ON shout_channel_polls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON shout_channel_poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_user ON shout_channel_poll_votes(user_address);

-- Enable RLS
ALTER TABLE shout_channel_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE shout_channel_poll_votes ENABLE ROW LEVEL SECURITY;

-- Policies for polls
CREATE POLICY "Anyone can view polls"
ON shout_channel_polls FOR SELECT USING (true);

CREATE POLICY "Members can create polls"
ON shout_channel_polls FOR INSERT WITH CHECK (true);

CREATE POLICY "Creators can update their polls"
ON shout_channel_polls FOR UPDATE USING (true);

-- Policies for votes
CREATE POLICY "Anyone can view votes"
ON shout_channel_poll_votes FOR SELECT USING (true);

CREATE POLICY "Members can vote"
ON shout_channel_poll_votes FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can remove their votes"
ON shout_channel_poll_votes FOR DELETE USING (true);
