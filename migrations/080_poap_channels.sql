-- POAP-linked channels: one channel per POAP event (e.g. Devcon 2026)
-- Channels created from POAPs use Logos/Waku messaging.

-- Link channel to a POAP event (optional; when set, channel is the "POAP channel" for that event)
ALTER TABLE shout_public_channels
ADD COLUMN IF NOT EXISTS poap_event_id INTEGER UNIQUE;

ALTER TABLE shout_public_channels
ADD COLUMN IF NOT EXISTS poap_event_name TEXT;

ALTER TABLE shout_public_channels
ADD COLUMN IF NOT EXISTS poap_image_url TEXT;

-- Index for lookup: find channel by POAP event
CREATE UNIQUE INDEX IF NOT EXISTS idx_channels_poap_event_id
ON shout_public_channels(poap_event_id) WHERE poap_event_id IS NOT NULL;

COMMENT ON COLUMN shout_public_channels.poap_event_id IS 'POAP event id from POAP API; at most one channel per event';
COMMENT ON COLUMN shout_public_channels.poap_event_name IS 'Display name of the POAP event (e.g. Devcon 2026)';
COMMENT ON COLUMN shout_public_channels.poap_image_url IS 'POAP artwork URL for the channel icon';
