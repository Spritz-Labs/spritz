-- User Registration Preferences
-- Stores user information for automatic event registration (e.g., Luma forms)

CREATE TABLE IF NOT EXISTS shout_user_registration_prefs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address TEXT NOT NULL,
    full_name TEXT,
    email TEXT,
    phone TEXT,
    company TEXT,
    job_title TEXT,
    twitter_handle TEXT,
    linkedin_url TEXT,
    dietary_restrictions TEXT,
    accessibility_needs TEXT,
    notes TEXT, -- Any additional notes for registration
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- One preference record per user
    UNIQUE(wallet_address)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_user_registration_prefs_address 
ON shout_user_registration_prefs(wallet_address);

-- Enable RLS
ALTER TABLE shout_user_registration_prefs ENABLE ROW LEVEL SECURITY;

-- Users can read and write their own preferences
CREATE POLICY "Users can view their own registration preferences"
ON shout_user_registration_prefs FOR SELECT
USING (auth.uid()::text = wallet_address OR 
       current_setting('request.jwt.claims', true)::json->>'wallet_address' = wallet_address);

CREATE POLICY "Users can insert their own registration preferences"
ON shout_user_registration_prefs FOR INSERT
WITH CHECK (auth.uid()::text = wallet_address OR 
            current_setting('request.jwt.claims', true)::json->>'wallet_address' = wallet_address);

CREATE POLICY "Users can update their own registration preferences"
ON shout_user_registration_prefs FOR UPDATE
USING (auth.uid()::text = wallet_address OR 
       current_setting('request.jwt.claims', true)::json->>'wallet_address' = wallet_address);

COMMENT ON TABLE shout_user_registration_prefs IS 'Stores user information for automatic event registration';
COMMENT ON COLUMN shout_user_registration_prefs.wallet_address IS 'User wallet address (primary identifier)';
