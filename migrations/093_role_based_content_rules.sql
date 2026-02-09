-- Role-Based Content Rules
-- Convert boolean content toggles to role-based text values:
--   'everyone'  = all users can use this content type
--   'mods_only' = only admins and moderators can use it
--   'disabled'  = disabled for everyone (admins exempt)

-- Convert each boolean column to text with data migration

ALTER TABLE shout_chat_rules
    ALTER COLUMN links_allowed TYPE TEXT USING CASE WHEN links_allowed THEN 'everyone' ELSE 'disabled' END,
    ALTER COLUMN links_allowed SET DEFAULT 'everyone';

ALTER TABLE shout_chat_rules
    ALTER COLUMN photos_allowed TYPE TEXT USING CASE WHEN photos_allowed THEN 'everyone' ELSE 'disabled' END,
    ALTER COLUMN photos_allowed SET DEFAULT 'everyone';

ALTER TABLE shout_chat_rules
    ALTER COLUMN pixel_art_allowed TYPE TEXT USING CASE WHEN pixel_art_allowed THEN 'everyone' ELSE 'disabled' END,
    ALTER COLUMN pixel_art_allowed SET DEFAULT 'everyone';

ALTER TABLE shout_chat_rules
    ALTER COLUMN gifs_allowed TYPE TEXT USING CASE WHEN gifs_allowed THEN 'everyone' ELSE 'disabled' END,
    ALTER COLUMN gifs_allowed SET DEFAULT 'everyone';

ALTER TABLE shout_chat_rules
    ALTER COLUMN polls_allowed TYPE TEXT USING CASE WHEN polls_allowed THEN 'everyone' ELSE 'disabled' END,
    ALTER COLUMN polls_allowed SET DEFAULT 'everyone';

ALTER TABLE shout_chat_rules
    ALTER COLUMN location_sharing_allowed TYPE TEXT USING CASE WHEN location_sharing_allowed THEN 'everyone' ELSE 'disabled' END,
    ALTER COLUMN location_sharing_allowed SET DEFAULT 'everyone';

ALTER TABLE shout_chat_rules
    ALTER COLUMN voice_allowed TYPE TEXT USING CASE WHEN voice_allowed THEN 'everyone' ELSE 'disabled' END,
    ALTER COLUMN voice_allowed SET DEFAULT 'everyone';

-- Add check constraints for valid values
ALTER TABLE shout_chat_rules
    ADD CONSTRAINT chk_links_allowed CHECK (links_allowed IN ('everyone', 'mods_only', 'disabled')),
    ADD CONSTRAINT chk_photos_allowed CHECK (photos_allowed IN ('everyone', 'mods_only', 'disabled')),
    ADD CONSTRAINT chk_pixel_art_allowed CHECK (pixel_art_allowed IN ('everyone', 'mods_only', 'disabled')),
    ADD CONSTRAINT chk_gifs_allowed CHECK (gifs_allowed IN ('everyone', 'mods_only', 'disabled')),
    ADD CONSTRAINT chk_polls_allowed CHECK (polls_allowed IN ('everyone', 'mods_only', 'disabled')),
    ADD CONSTRAINT chk_location_sharing_allowed CHECK (location_sharing_allowed IN ('everyone', 'mods_only', 'disabled')),
    ADD CONSTRAINT chk_voice_allowed CHECK (voice_allowed IN ('everyone', 'mods_only', 'disabled'));
