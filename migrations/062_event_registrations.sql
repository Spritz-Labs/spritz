-- Event Registrations Tracking
-- Tracks user registrations for events

CREATE TABLE IF NOT EXISTS shout_event_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address TEXT NOT NULL,
    event_url TEXT NOT NULL,
    event_id UUID REFERENCES shout_agent_events(id) ON DELETE SET NULL,
    agent_id UUID REFERENCES shout_agents(id) ON DELETE SET NULL,
    registration_data JSONB, -- Stores user info used for registration
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for lookups
CREATE INDEX IF NOT EXISTS idx_event_registrations_address 
ON shout_event_registrations(wallet_address);

CREATE INDEX IF NOT EXISTS idx_event_registrations_event 
ON shout_event_registrations(event_id);

CREATE INDEX IF NOT EXISTS idx_event_registrations_agent 
ON shout_event_registrations(agent_id);

-- Enable RLS
ALTER TABLE shout_event_registrations ENABLE ROW LEVEL SECURITY;

-- Users can view their own registrations
CREATE POLICY "Users can view their own registrations"
ON shout_event_registrations FOR SELECT
USING (auth.uid()::text = wallet_address OR 
       current_setting('request.jwt.claims', true)::json->>'wallet_address' = wallet_address);

COMMENT ON TABLE shout_event_registrations IS 'Tracks user registrations for events';
COMMENT ON COLUMN shout_event_registrations.registration_data IS 'JSON object containing user info used for registration';
