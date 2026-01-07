-- Beta Access Application Migration
-- Adds field to track users who have applied for beta access

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shout_users' AND column_name = 'beta_access_applied') THEN
        ALTER TABLE shout_users ADD COLUMN beta_access_applied BOOLEAN DEFAULT FALSE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shout_users' AND column_name = 'beta_access_applied_at') THEN
        ALTER TABLE shout_users ADD COLUMN beta_access_applied_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Create index for filtering users who applied
CREATE INDEX IF NOT EXISTS idx_users_beta_access_applied ON shout_users(beta_access_applied);

-- Add comment for documentation
COMMENT ON COLUMN shout_users.beta_access_applied IS 'Whether the user has applied for beta access';
COMMENT ON COLUMN shout_users.beta_access_applied_at IS 'When the user applied for beta access';

