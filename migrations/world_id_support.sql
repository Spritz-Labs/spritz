-- World ID Support Migration
-- Run this in your Supabase SQL editor
-- 
-- World ID uses nullifier hashes as identifiers which are 66 characters (0x + 64 hex chars)
-- This is longer than standard Ethereum addresses (42 characters: 0x + 40 hex chars)
-- This migration ensures all tables can handle World ID nullifier hashes

-- 1. Create shout_usernames table if it doesn't exist
-- This table stores claimed usernames mapped to wallet addresses
CREATE TABLE IF NOT EXISTS shout_usernames (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    wallet_address TEXT NOT NULL UNIQUE, -- Can be ETH address (42 chars), Solana (32-44 chars), or World ID nullifier (66 chars)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usernames_wallet ON shout_usernames(wallet_address);
CREATE INDEX IF NOT EXISTS idx_usernames_username ON shout_usernames(username);

-- Enable RLS
ALTER TABLE shout_usernames ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Allow all on usernames" ON shout_usernames FOR ALL USING (true);

-- 2. Create shout_user_settings table if it doesn't exist
CREATE TABLE IF NOT EXISTS shout_user_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    wallet_address TEXT NOT NULL UNIQUE, -- Can be ETH, Solana, or World ID nullifier
    notifications_enabled BOOLEAN DEFAULT true,
    sound_enabled BOOLEAN DEFAULT true,
    theme TEXT DEFAULT 'dark',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_settings_wallet ON shout_user_settings(wallet_address);

-- Enable RLS
ALTER TABLE shout_user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Allow all on user_settings" ON shout_user_settings FOR ALL USING (true);

-- 3. Add auth_provider column to track how user authenticated
-- This helps distinguish between wallet users, World ID users, Alien users, etc.
ALTER TABLE shout_users 
ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'wallet';

COMMENT ON COLUMN shout_users.auth_provider IS 'Authentication provider: wallet, world_id, alien, passkey, email';

-- 4. Update wallet_type column to include new auth types
COMMENT ON COLUMN shout_users.wallet_type IS 'Wallet/auth type: metamask, walletconnect, coinbase, phantom, passkey, world_id, alien, email, etc.';

-- Done!
SELECT 'World ID support migration complete!' as status;
