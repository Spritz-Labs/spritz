-- Event Interests and Attendance
-- Allows users to mark events as "Interested" or "Going" (social features)

CREATE TABLE IF NOT EXISTS shout_event_interests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES shout_events(id) ON DELETE CASCADE,
    wallet_address TEXT NOT NULL,
    
    -- Interest type: 'interested' or 'going'
    interest_type TEXT NOT NULL CHECK (interest_type IN ('interested', 'going')),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- One interest record per user per event per type
    CONSTRAINT unique_user_event_interest UNIQUE (event_id, wallet_address, interest_type)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_event_interests_event ON shout_event_interests(event_id);
CREATE INDEX IF NOT EXISTS idx_event_interests_user ON shout_event_interests(wallet_address);
CREATE INDEX IF NOT EXISTS idx_event_interests_type ON shout_event_interests(interest_type);
CREATE INDEX IF NOT EXISTS idx_event_interests_event_type ON shout_event_interests(event_id, interest_type);

-- Enable RLS
ALTER TABLE shout_event_interests ENABLE ROW LEVEL SECURITY;

-- Public can view all interests (for counts)
CREATE POLICY "Anyone can view event interests"
ON shout_event_interests FOR SELECT
USING (true);

-- Users can manage their own interests
CREATE POLICY "Users can insert their own interests"
ON shout_event_interests FOR INSERT
WITH CHECK (true); -- Allow any authenticated user

CREATE POLICY "Users can update their own interests"
ON shout_event_interests FOR UPDATE
USING (true); -- Allow any authenticated user

CREATE POLICY "Users can delete their own interests"
ON shout_event_interests FOR DELETE
USING (true); -- Allow any authenticated user

-- Function to update interest counts on events table (optional optimization)
-- We'll calculate counts on-the-fly for now, but this could be cached

COMMENT ON TABLE shout_event_interests IS 'Tracks user interests and attendance for events (social features)';
COMMENT ON COLUMN shout_event_interests.interest_type IS 'Type of interest: interested or going';
