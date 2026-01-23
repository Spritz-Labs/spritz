-- Firecrawl Web Sources for Official Agents
-- Enables better web scraping with auto-sync for RAG knowledge base

-- Add Firecrawl-specific columns to knowledge table
ALTER TABLE shout_agent_knowledge 
ADD COLUMN IF NOT EXISTS scrape_method TEXT DEFAULT 'basic' CHECK (scrape_method IN ('basic', 'firecrawl'));

ALTER TABLE shout_agent_knowledge 
ADD COLUMN IF NOT EXISTS crawl_depth INTEGER DEFAULT 1;

ALTER TABLE shout_agent_knowledge 
ADD COLUMN IF NOT EXISTS auto_sync BOOLEAN DEFAULT FALSE;

ALTER TABLE shout_agent_knowledge 
ADD COLUMN IF NOT EXISTS sync_interval_hours INTEGER DEFAULT 24;

ALTER TABLE shout_agent_knowledge 
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

ALTER TABLE shout_agent_knowledge 
ADD COLUMN IF NOT EXISTS exclude_patterns TEXT[];

ALTER TABLE shout_agent_knowledge 
ADD COLUMN IF NOT EXISTS firecrawl_job_id TEXT;

-- Index for finding sources that need syncing
CREATE INDEX IF NOT EXISTS idx_knowledge_auto_sync 
ON shout_agent_knowledge(auto_sync, last_synced_at) 
WHERE auto_sync = TRUE;

-- Index for finding by scrape method
CREATE INDEX IF NOT EXISTS idx_knowledge_scrape_method 
ON shout_agent_knowledge(scrape_method);

-- Function to check if a knowledge item needs syncing
CREATE OR REPLACE FUNCTION knowledge_needs_sync(
    p_auto_sync BOOLEAN,
    p_last_synced_at TIMESTAMPTZ,
    p_sync_interval_hours INTEGER
) RETURNS BOOLEAN AS $$
BEGIN
    IF NOT p_auto_sync THEN
        RETURN FALSE;
    END IF;
    
    IF p_last_synced_at IS NULL THEN
        RETURN TRUE;
    END IF;
    
    RETURN p_last_synced_at < NOW() - (p_sync_interval_hours || ' hours')::INTERVAL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- View to find knowledge items needing sync (for official agents only)
CREATE OR REPLACE VIEW knowledge_pending_sync AS
SELECT 
    k.id,
    k.agent_id,
    k.url,
    k.scrape_method,
    k.crawl_depth,
    k.exclude_patterns,
    k.last_synced_at,
    k.sync_interval_hours,
    a.name as agent_name,
    a.visibility
FROM shout_agent_knowledge k
JOIN shout_agents a ON a.id = k.agent_id
WHERE k.auto_sync = TRUE
  AND a.visibility = 'official'
  AND knowledge_needs_sync(k.auto_sync, k.last_synced_at, k.sync_interval_hours);

COMMENT ON TABLE shout_agent_knowledge IS 'Knowledge sources for agent RAG. Official agents can use Firecrawl for better scraping.';
COMMENT ON COLUMN shout_agent_knowledge.scrape_method IS 'Scraping method: basic (regex HTML cleaning) or firecrawl (API-powered)';
COMMENT ON COLUMN shout_agent_knowledge.auto_sync IS 'Whether to automatically re-scrape this source on schedule';
COMMENT ON COLUMN shout_agent_knowledge.sync_interval_hours IS 'Hours between auto-syncs (default: 24 = daily)';
