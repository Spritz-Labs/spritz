-- Delve Integration Migration - Stores Delve agent configuration and registration status
-- V1: Basic Delve agent configuration

CREATE TABLE IF NOT EXISTS delve_agent_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES shout_agents(id) ON DELETE CASCADE,
  delve_agent_id TEXT,
  knowledge_collection_enabled BOOLEAN DEFAULT false,
  bonfire_id TEXT,
  registration_status TEXT DEFAULT 'pending'
    CHECK (registration_status IN ('pending', 'registered', 'failed')),
  registration_error TEXT,
  registered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (agent_id)
);

CREATE INDEX IF NOT EXISTS idx_delve_config_agent
  ON delve_agent_config(agent_id);
CREATE INDEX IF NOT EXISTS idx_delve_config_delve_agent
  ON delve_agent_config(delve_agent_id);
CREATE INDEX IF NOT EXISTS idx_delve_config_knowledge_enabled
  ON delve_agent_config(knowledge_collection_enabled)
  WHERE knowledge_collection_enabled = true;
CREATE INDEX IF NOT EXISTS idx_delve_config_registration_status
  ON delve_agent_config(registration_status);

ALTER TABLE delve_agent_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage delve config" ON delve_agent_config;
CREATE POLICY "Users can manage delve config"
  ON delve_agent_config
  FOR ALL
  USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE delve_agent_config;

COMMENT ON TABLE delve_agent_config IS
  'Stores Delve agent configuration and registration status for AI agents';
COMMENT ON COLUMN delve_agent_config.delve_agent_id IS
  'Delve-assigned agent identifier';
COMMENT ON COLUMN delve_agent_config.registration_status IS
  'Registration status: pending, registered, or failed';
COMMENT ON COLUMN delve_agent_config.knowledge_collection_enabled IS
  'Whether knowledge collection is enabled for this agent';
