-- Add geocoding support and image_url alias for events
-- Also add columns for event sources crawl settings

-- Add latitude/longitude for map display
ALTER TABLE shout_events
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- Add image_url as alias for banner_image_url (for consistency with scraper)
-- Using a view or just updating directly via banner_image_url

-- Add infinite scroll settings to event sources
ALTER TABLE shout_event_sources
ADD COLUMN IF NOT EXISTS crawl_depth INTEGER DEFAULT 2,
ADD COLUMN IF NOT EXISTS max_pages INTEGER DEFAULT 20,
ADD COLUMN IF NOT EXISTS infinite_scroll BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS scroll_count INTEGER DEFAULT 5;

-- Index for geospatial queries (simple box queries)
CREATE INDEX IF NOT EXISTS idx_events_location ON shout_events(latitude, longitude) 
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

COMMENT ON COLUMN shout_events.latitude IS 'Latitude coordinate for map display';
COMMENT ON COLUMN shout_events.longitude IS 'Longitude coordinate for map display';
