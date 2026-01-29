-- Add infinite scroll support to agent knowledge items
-- For scraping pages that lazy-load content as you scroll

ALTER TABLE shout_agent_knowledge
ADD COLUMN IF NOT EXISTS infinite_scroll BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS scroll_count INTEGER DEFAULT 5;

COMMENT ON COLUMN shout_agent_knowledge.infinite_scroll IS 'Whether to use infinite scroll mode when scraping';
COMMENT ON COLUMN shout_agent_knowledge.scroll_count IS 'Number of scroll iterations for infinite scroll mode';
