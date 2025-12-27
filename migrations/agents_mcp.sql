-- Add MCP server configuration to agents table
-- Run this in your Supabase SQL Editor

-- Add MCP servers configuration column (JSONB array)
-- Structure: [{ id, name, url, apiKey, description, x402Enabled, x402PriceCents }]
ALTER TABLE shout_agents 
ADD COLUMN IF NOT EXISTS mcp_servers JSONB DEFAULT '[]'::jsonb;

-- Add x402 pricing mode column
-- 'global' = single price for all interactions
-- 'per_tool' = different prices per MCP tool
ALTER TABLE shout_agents 
ADD COLUMN IF NOT EXISTS x402_pricing_mode TEXT DEFAULT 'global';

-- Add index for querying agents with MCP servers
CREATE INDEX IF NOT EXISTS idx_agents_mcp_servers 
ON shout_agents USING gin (mcp_servers);

COMMENT ON COLUMN shout_agents.mcp_servers IS 'JSON array of MCP server configurations: [{id, name, url, apiKey, description, x402Enabled, x402PriceCents}]';
COMMENT ON COLUMN shout_agents.x402_pricing_mode IS 'Pricing mode: global (single price) or per_tool (price per MCP tool)';

