-- POAP Collections: link channel to a POAP collection (user can join if they hold any POAP in the collection)
ALTER TABLE shout_public_channels
ADD COLUMN IF NOT EXISTS poap_collection_id INTEGER UNIQUE;

ALTER TABLE shout_public_channels
ADD COLUMN IF NOT EXISTS poap_collection_name TEXT;

ALTER TABLE shout_public_channels
ADD COLUMN IF NOT EXISTS poap_collection_image_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_channels_poap_collection_id
ON shout_public_channels(poap_collection_id) WHERE poap_collection_id IS NOT NULL;

COMMENT ON COLUMN shout_public_channels.poap_collection_id IS 'POAP collection id from POAP SDK; at most one channel per collection';
COMMENT ON COLUMN shout_public_channels.poap_collection_name IS 'Display name of the POAP collection';
COMMENT ON COLUMN shout_public_channels.poap_collection_image_url IS 'Collection logo/banner URL for the channel icon';
