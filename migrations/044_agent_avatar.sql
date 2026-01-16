-- Add custom avatar URL support for agents
-- Allows users to upload images instead of just using emojis

ALTER TABLE shout_agents 
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

COMMENT ON COLUMN shout_agents.avatar_url IS 'URL to custom uploaded avatar image (optional, falls back to avatar_emoji)';
