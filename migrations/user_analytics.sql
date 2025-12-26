-- User Analytics Migration
-- Adds tracking columns to shout_users table

-- Add analytics columns to shout_users
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shout_users' AND column_name = 'friends_count') THEN
        ALTER TABLE shout_users ADD COLUMN friends_count INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shout_users' AND column_name = 'messages_sent') THEN
        ALTER TABLE shout_users ADD COLUMN messages_sent INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shout_users' AND column_name = 'voice_minutes') THEN
        ALTER TABLE shout_users ADD COLUMN voice_minutes INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shout_users' AND column_name = 'video_minutes') THEN
        ALTER TABLE shout_users ADD COLUMN video_minutes INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shout_users' AND column_name = 'groups_count') THEN
        ALTER TABLE shout_users ADD COLUMN groups_count INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shout_users' AND column_name = 'total_calls') THEN
        ALTER TABLE shout_users ADD COLUMN total_calls INTEGER DEFAULT 0;
    END IF;
END $$;

-- Create indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_users_messages_sent ON shout_users(messages_sent DESC);
CREATE INDEX IF NOT EXISTS idx_users_friends_count ON shout_users(friends_count DESC);
CREATE INDEX IF NOT EXISTS idx_users_voice_minutes ON shout_users(voice_minutes DESC);

-- Create function to safely increment user stats
CREATE OR REPLACE FUNCTION increment_user_stat(
    p_address TEXT,
    p_column TEXT,
    p_amount INTEGER
)
RETURNS void AS $$
BEGIN
    EXECUTE format(
        'UPDATE shout_users SET %I = GREATEST(0, COALESCE(%I, 0) + $1), updated_at = NOW() WHERE wallet_address = $2',
        p_column, p_column
    ) USING p_amount, p_address;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT 'User analytics migration complete!' as status;

