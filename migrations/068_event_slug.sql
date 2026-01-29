-- Custom URL slug for events (e.g. /event/example)
ALTER TABLE shout_events
ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_slug ON shout_events(slug) WHERE slug IS NOT NULL;

COMMENT ON COLUMN shout_events.slug IS 'Custom URL slug for /event/[slug] (e.g. "example" for app.spritz.chat/event/example)';
