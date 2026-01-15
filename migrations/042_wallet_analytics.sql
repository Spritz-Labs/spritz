-- Wallet analytics tracking
-- Track transactions, networks, and wallet usage for admin analytics

-- Wallet transactions table - tracks all transactions sent through Spritz
CREATE TABLE IF NOT EXISTS shout_wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_address VARCHAR(66) NOT NULL,  -- Spritz ID
    smart_wallet_address VARCHAR(42) NOT NULL,  -- Safe address
    tx_hash VARCHAR(66) NOT NULL,
    chain_id INTEGER NOT NULL,
    chain_name VARCHAR(50) NOT NULL,
    from_address VARCHAR(42) NOT NULL,
    to_address VARCHAR(42) NOT NULL,
    token_symbol VARCHAR(20) NOT NULL,
    token_address VARCHAR(42),  -- null for native tokens
    amount VARCHAR(78) NOT NULL,  -- Raw amount as string
    amount_formatted DECIMAL(38, 18),  -- Formatted with decimals
    amount_usd DECIMAL(18, 2),  -- USD value at time of tx
    tx_type VARCHAR(20) NOT NULL DEFAULT 'send',  -- 'send', 'receive', 'swap', etc.
    status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- 'pending', 'confirmed', 'failed'
    gas_used VARCHAR(78),
    gas_price VARCHAR(78),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ,
    
    CONSTRAINT unique_tx_hash_chain UNIQUE(tx_hash, chain_id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_wallet_tx_user ON shout_wallet_transactions(user_address);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_smart_wallet ON shout_wallet_transactions(smart_wallet_address);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_chain ON shout_wallet_transactions(chain_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_created ON shout_wallet_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_status ON shout_wallet_transactions(status);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_type ON shout_wallet_transactions(tx_type);

-- Network usage aggregation table (updated periodically)
CREATE TABLE IF NOT EXISTS shout_wallet_network_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chain_id INTEGER NOT NULL UNIQUE,
    chain_name VARCHAR(50) NOT NULL,
    total_transactions INTEGER DEFAULT 0,
    total_volume_usd DECIMAL(24, 2) DEFAULT 0,
    unique_users INTEGER DEFAULT 0,
    last_updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert supported networks
INSERT INTO shout_wallet_network_stats (chain_id, chain_name) VALUES
    (1, 'Ethereum'),
    (8453, 'Base'),
    (137, 'Polygon'),
    (42161, 'Arbitrum'),
    (10, 'Optimism'),
    (43114, 'Avalanche'),
    (56, 'BNB Chain')
ON CONFLICT (chain_id) DO NOTHING;

-- Add wallet analytics columns to shout_users
ALTER TABLE shout_users
ADD COLUMN IF NOT EXISTS wallet_tx_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS wallet_volume_usd DECIMAL(24, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_wallet_tx_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS preferred_chain_id INTEGER;

-- Comments
COMMENT ON TABLE shout_wallet_transactions IS 'Tracks all wallet transactions sent through Spritz for analytics';
COMMENT ON TABLE shout_wallet_network_stats IS 'Aggregated network usage statistics for wallet analytics';
COMMENT ON COLUMN shout_users.wallet_tx_count IS 'Total number of wallet transactions by this user';
COMMENT ON COLUMN shout_users.wallet_volume_usd IS 'Total USD volume of wallet transactions';
COMMENT ON COLUMN shout_users.last_wallet_tx_at IS 'Timestamp of last wallet transaction';
COMMENT ON COLUMN shout_users.preferred_chain_id IS 'Most used chain by this user';

SELECT 'Wallet analytics tables created successfully!' as status;
