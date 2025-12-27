-- Migration: Add API Tools support to agents
-- This allows agents to make calls to external REST APIs

-- Add api_tools column to store configured API endpoints
ALTER TABLE shout_agents 
ADD COLUMN IF NOT EXISTS api_tools JSONB DEFAULT '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN shout_agents.api_tools IS 'Array of API tool configurations: [{id, name, url, method, apiKey?, headers?, description?, x402Enabled?, x402PriceCents?}]';

