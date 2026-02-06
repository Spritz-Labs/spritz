-- Agent Channel Presence: support Location chats and POAP channels
-- - channel_type can be 'global' | 'channel' | 'location'
-- - For 'channel', channel_id = shout_public_channels.id (includes POAP channels)
-- - For 'location', channel_id = shout_location_chats.id (no FK so one column works for both)

-- Drop FK so channel_id can reference either shout_public_channels or shout_location_chats
ALTER TABLE shout_agent_channel_memberships
DROP CONSTRAINT IF EXISTS shout_agent_channel_memberships_channel_id_fkey;

-- Allow channel_type 'location'
ALTER TABLE shout_agent_channel_memberships
DROP CONSTRAINT IF EXISTS shout_agent_channel_memberships_channel_type_check;

ALTER TABLE shout_agent_channel_memberships
ADD CONSTRAINT shout_agent_channel_memberships_channel_type_check
CHECK (channel_type IN ('global', 'channel', 'location'));

COMMENT ON COLUMN shout_agent_channel_memberships.channel_type IS 'global = Spritz Global Chat; channel = public/POAP channel (shout_public_channels.id); location = location chat (shout_location_chats.id)';
COMMENT ON COLUMN shout_agent_channel_memberships.channel_id IS 'For channel_type=channel: shout_public_channels.id. For channel_type=location: shout_location_chats.id. NULL for global.';
