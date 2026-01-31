-- Cost estimate, errors, tool failures, feedback for agent chats
ALTER TABLE shout_agent_chats
ADD COLUMN IF NOT EXISTS estimated_cost_usd NUMERIC(12, 6),
ADD COLUMN IF NOT EXISTS error_code TEXT,
ADD COLUMN IF NOT EXISTS error_message TEXT,
ADD COLUMN IF NOT EXISTS tool_errors JSONB,
ADD COLUMN IF NOT EXISTS feedback_type TEXT CHECK (feedback_type IN ('up', 'down')),
ADD COLUMN IF NOT EXISTS feedback_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS feedback_by TEXT;

COMMENT ON COLUMN shout_agent_chats.estimated_cost_usd IS 'Estimated cost in USD from token counts × provider price per 1M';
COMMENT ON COLUMN shout_agent_chats.error_code IS 'Error code on failed assistant (e.g. STREAM_ERROR, RATE_LIMIT)';
COMMENT ON COLUMN shout_agent_chats.error_message IS 'Sanitized error message on failed assistant (truncated, no stack)';
COMMENT ON COLUMN shout_agent_chats.tool_errors IS 'MCP tool call failures: [{server, toolName, error?}]';
COMMENT ON COLUMN shout_agent_chats.feedback_type IS 'Thumbs up/down from user or admin';
COMMENT ON COLUMN shout_agent_chats.feedback_at IS 'When feedback was set';
COMMENT ON COLUMN shout_agent_chats.feedback_by IS 'Address (admin or user) who set feedback';

CREATE INDEX IF NOT EXISTS idx_agent_chats_error_code ON shout_agent_chats(error_code) WHERE error_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_chats_feedback ON shout_agent_chats(feedback_type) WHERE feedback_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_chats_tool_errors ON shout_agent_chats USING GIN (tool_errors) WHERE tool_errors IS NOT NULL;
