-- Add content_hash column to event sources for change detection
-- This allows the scraper to skip re-extraction when content hasn't changed

ALTER TABLE shout_event_sources
ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- Index for faster lookups when checking if content has changed
CREATE INDEX IF NOT EXISTS idx_event_sources_content_hash ON shout_event_sources(content_hash) 
WHERE content_hash IS NOT NULL;

COMMENT ON COLUMN shout_event_sources.content_hash IS 'MD5 hash of scraped content for change detection';
