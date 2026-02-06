-- Migration: Add welcome_shown_at to track when welcome modal was shown
-- This is more reliable than relying on login_count since auth flows may increment it

-- Add welcome_shown_at column to track when welcome was shown
ALTER TABLE shout_users 
ADD COLUMN IF NOT EXISTS welcome_shown_at TIMESTAMPTZ DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN shout_users.welcome_shown_at IS 'Timestamp when welcome modal was shown to the user. NULL means welcome not yet shown.';

-- Create index for querying users who haven't seen welcome
CREATE INDEX IF NOT EXISTS idx_shout_users_welcome_shown 
ON shout_users (welcome_shown_at) 
WHERE welcome_shown_at IS NULL;
