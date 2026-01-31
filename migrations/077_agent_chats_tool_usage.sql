-- Agent chat analytics: tool calls and token/usage for admin and debugging
ALTER TABLE shout_agent_chats
ADD COLUMN IF NOT EXISTS tool_calls JSONB,
ADD COLUMN IF NOT EXISTS input_tokens INTEGER,
ADD COLUMN IF NOT EXISTS output_tokens INTEGER,
ADD COLUMN IF NOT EXISTS total_tokens INTEGER,
ADD COLUMN IF NOT EXISTS model TEXT,
ADD COLUMN IF NOT EXISTS latency_ms INTEGER;

COMMENT ON COLUMN shout_agent_chats.tool_calls IS 'MCP/external tool invocations for this message: [{server, toolName, args?}]';
COMMENT ON COLUMN shout_agent_chats.input_tokens IS 'Prompt token count from provider (e.g. Gemini)';
COMMENT ON COLUMN shout_agent_chats.output_tokens IS 'Completion token count';
COMMENT ON COLUMN shout_agent_chats.total_tokens IS 'Total tokens used';
COMMENT ON COLUMN shout_agent_chats.model IS 'Model used (e.g. gemini-2.0-flash)';
COMMENT ON COLUMN shout_agent_chats.latency_ms IS 'End-to-end latency in milliseconds';

CREATE INDEX IF NOT EXISTS idx_agent_chats_tool_calls ON shout_agent_chats USING GIN (tool_calls) WHERE tool_calls IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_chats_total_tokens ON shout_agent_chats(total_tokens) WHERE total_tokens IS NOT NULL;
