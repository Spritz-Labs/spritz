-- Add slug column to shout_public_channels for custom URL paths
-- e.g. /channel/alien → resolves to the official Alien channel

ALTER TABLE shout_public_channels
ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- Index for fast slug lookups
CREATE INDEX IF NOT EXISTS idx_shout_public_channels_slug ON shout_public_channels (slug) WHERE slug IS NOT NULL;

-- Set initial slug for the Alien channel
UPDATE shout_public_channels SET slug = 'alien' WHERE name = 'Alien' AND is_official = true;
