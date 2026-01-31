-- Store source of each agent chat for knowledge graph: direct (1:1), public (unauthenticated), channel (@mentions)
ALTER TABLE shout_agent_chats
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'direct' CHECK (source IN ('direct', 'public', 'channel')),
ADD COLUMN IF NOT EXISTS channel_id UUID NULL,
ADD COLUMN IF NOT EXISTS channel_type TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_chats_source ON shout_agent_chats(source);
CREATE INDEX IF NOT EXISTS idx_agent_chats_channel ON shout_agent_chats(channel_id, channel_type) WHERE channel_id IS NOT NULL;

COMMENT ON COLUMN shout_agent_chats.source IS 'Where the conversation happened: direct (1:1), public (unauthenticated page), channel (@mention)';
COMMENT ON COLUMN shout_agent_chats.channel_id IS 'Channel UUID when source=channel; null otherwise';
COMMENT ON COLUMN shout_agent_chats.channel_type IS 'global or channel when source=channel';
