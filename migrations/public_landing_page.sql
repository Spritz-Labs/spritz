-- Public Profile Migration
-- Adds support for users to enable a public profile

-- Add public profile setting to user settings
ALTER TABLE shout_user_settings 
ADD COLUMN IF NOT EXISTS public_landing_enabled BOOLEAN DEFAULT false;

-- Create index for users with public profiles enabled
CREATE INDEX IF NOT EXISTS idx_user_settings_public_landing_enabled 
ON shout_user_settings (public_landing_enabled) 
WHERE public_landing_enabled = true;

COMMENT ON COLUMN shout_user_settings.public_landing_enabled IS 'Whether this user has enabled a public profile at /user/[address]';

