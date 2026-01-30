-- Add session_id to shout_agent_chats for public/official agent conversation continuity
ALTER TABLE shout_agent_chats
ADD COLUMN IF NOT EXISTS session_id TEXT;

CREATE INDEX IF NOT EXISTS idx_agent_chats_session ON shout_agent_chats(agent_id, session_id)
WHERE session_id IS NOT NULL;

COMMENT ON COLUMN shout_agent_chats.session_id IS 'Public chat session id (e.g. from localStorage); used for unauthenticated continuity';
