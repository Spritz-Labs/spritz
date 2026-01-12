-- Embedded wallets for users
CREATE TABLE IF NOT EXISTS shout_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES shout_users(id),
    wallet_address VARCHAR(42) UNIQUE NOT NULL,
    encrypted_private_key TEXT,
    wallet_type VARCHAR(20) NOT NULL, -- 'embedded', 'email', 'passkey'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    backed_up_at TIMESTAMPTZ,
    
    CONSTRAINT unique_user_wallet UNIQUE(user_id, wallet_type)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_shout_wallets_address ON shout_wallets(wallet_address);
CREATE INDEX IF NOT EXISTS idx_shout_wallets_user ON shout_wallets(user_id);
