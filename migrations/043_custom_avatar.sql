-- Add custom avatar support to user settings
-- Allows users to upload their own profile photo and choose between it or ENS avatar

ALTER TABLE shout_user_settings 
ADD COLUMN IF NOT EXISTS custom_avatar_url TEXT,
ADD COLUMN IF NOT EXISTS use_custom_avatar BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN shout_user_settings.custom_avatar_url IS 'URL to user uploaded custom avatar image';
COMMENT ON COLUMN shout_user_settings.use_custom_avatar IS 'If true, use custom avatar instead of ENS avatar';
