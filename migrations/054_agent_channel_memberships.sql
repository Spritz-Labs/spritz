-- Agent Channel Memberships
-- Allows Official agents to be added to public channels (Global Chat, # channels)
-- Users can @mention agents to interact with them

CREATE TABLE IF NOT EXISTS shout_agent_channel_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES shout_agents(id) ON DELETE CASCADE,
    channel_type TEXT NOT NULL CHECK (channel_type IN ('global', 'channel')),
    channel_id UUID REFERENCES shout_public_channels(id) ON DELETE CASCADE, -- NULL for global chat
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT, -- Admin who added the agent
    
    -- Ensure unique agent per channel
    UNIQUE(agent_id, channel_type, channel_id)
);

-- Index for quick lookup of agents in a channel
CREATE INDEX IF NOT EXISTS idx_agent_channel_memberships_channel 
ON shout_agent_channel_memberships(channel_type, channel_id);

-- Index for quick lookup of channels an agent is in
CREATE INDEX IF NOT EXISTS idx_agent_channel_memberships_agent 
ON shout_agent_channel_memberships(agent_id);

-- Add RLS policies
ALTER TABLE shout_agent_channel_memberships ENABLE ROW LEVEL SECURITY;

-- Anyone can read agent memberships
CREATE POLICY "Agent channel memberships are viewable by everyone"
ON shout_agent_channel_memberships FOR SELECT
USING (true);

-- Only admins can manage agent memberships (handled in API)

COMMENT ON TABLE shout_agent_channel_memberships IS 'Tracks which Official agents are present in which channels for @mention interactions';
COMMENT ON COLUMN shout_agent_channel_memberships.channel_type IS 'Type of channel: global (Spritz Global Chat) or channel (public # channels)';
COMMENT ON COLUMN shout_agent_channel_memberships.channel_id IS 'Channel ID for public channels, NULL for global chat';
