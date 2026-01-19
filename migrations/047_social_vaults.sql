-- Spritz Social Vaults (Multi-signature Safe wallets)
-- Vaults allow users to create shared wallets with their friends

-- Main vault table
CREATE TABLE IF NOT EXISTS shout_vaults (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Vault metadata
    name VARCHAR(100) NOT NULL,
    description TEXT,
    emoji VARCHAR(10) DEFAULT '🔐',
    
    -- Safe contract details
    safe_address VARCHAR(42) NOT NULL,
    chain_id INTEGER NOT NULL,
    threshold INTEGER NOT NULL, -- Number of signatures required
    
    -- Creator info
    creator_address VARCHAR(42) NOT NULL,
    
    -- Status
    is_deployed BOOLEAN DEFAULT FALSE,
    deploy_tx_hash VARCHAR(66),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_vault_per_chain UNIQUE(safe_address, chain_id),
    CONSTRAINT valid_threshold CHECK (threshold >= 1)
);

-- Vault members (signers)
CREATE TABLE IF NOT EXISTS shout_vault_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vault_id UUID NOT NULL REFERENCES shout_vaults(id) ON DELETE CASCADE,
    
    -- Member info
    member_address VARCHAR(42) NOT NULL, -- User's Spritz ID
    smart_wallet_address VARCHAR(42) NOT NULL, -- User's Safe Smart Wallet (actual signer)
    
    -- Role
    is_creator BOOLEAN DEFAULT FALSE,
    
    -- Member metadata (optional)
    nickname VARCHAR(100),
    
    -- Join status
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'pending', 'removed'
    invited_at TIMESTAMPTZ DEFAULT NOW(),
    joined_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_member_per_vault UNIQUE(vault_id, member_address)
);

-- Vault transactions (for tracking pending multisig txs)
CREATE TABLE IF NOT EXISTS shout_vault_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vault_id UUID NOT NULL REFERENCES shout_vaults(id) ON DELETE CASCADE,
    
    -- Transaction details
    safe_tx_hash VARCHAR(66) NOT NULL,
    to_address VARCHAR(42) NOT NULL,
    value VARCHAR(78) DEFAULT '0', -- Wei value as string (bigint)
    data TEXT, -- Encoded calldata
    operation INTEGER DEFAULT 0, -- 0 = Call, 1 = DelegateCall
    
    -- Gas parameters
    safe_tx_gas VARCHAR(78) DEFAULT '0',
    base_gas VARCHAR(78) DEFAULT '0',
    gas_price VARCHAR(78) DEFAULT '0',
    gas_token VARCHAR(42) DEFAULT '0x0000000000000000000000000000000000000000',
    refund_receiver VARCHAR(42) DEFAULT '0x0000000000000000000000000000000000000000',
    nonce INTEGER NOT NULL,
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'executed', 'cancelled', 'failed'
    executed_tx_hash VARCHAR(66),
    
    -- Metadata
    description TEXT,
    created_by VARCHAR(42) NOT NULL,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    executed_at TIMESTAMPTZ,
    
    CONSTRAINT unique_vault_tx UNIQUE(vault_id, safe_tx_hash)
);

-- Transaction confirmations/signatures
CREATE TABLE IF NOT EXISTS shout_vault_confirmations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES shout_vault_transactions(id) ON DELETE CASCADE,
    
    -- Signer info
    signer_address VARCHAR(42) NOT NULL, -- Smart wallet address that signed
    signature TEXT NOT NULL, -- Hex encoded signature
    
    -- Timestamps
    signed_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_confirmation UNIQUE(transaction_id, signer_address)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_vaults_creator ON shout_vaults(creator_address);
CREATE INDEX IF NOT EXISTS idx_vaults_chain ON shout_vaults(chain_id);
CREATE INDEX IF NOT EXISTS idx_vaults_safe ON shout_vaults(safe_address);
CREATE INDEX IF NOT EXISTS idx_vault_members_address ON shout_vault_members(member_address);
CREATE INDEX IF NOT EXISTS idx_vault_members_smart_wallet ON shout_vault_members(smart_wallet_address);
CREATE INDEX IF NOT EXISTS idx_vault_members_vault ON shout_vault_members(vault_id);
CREATE INDEX IF NOT EXISTS idx_vault_txs_vault ON shout_vault_transactions(vault_id);
CREATE INDEX IF NOT EXISTS idx_vault_txs_status ON shout_vault_transactions(status);
CREATE INDEX IF NOT EXISTS idx_vault_confirmations_tx ON shout_vault_confirmations(transaction_id);

-- Enable RLS
ALTER TABLE shout_vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE shout_vault_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE shout_vault_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE shout_vault_confirmations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Vaults are visible to members
CREATE POLICY vault_select_policy ON shout_vaults FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM shout_vault_members 
            WHERE vault_id = shout_vaults.id 
            AND status = 'active'
        )
    );

-- Only creators can update vault metadata
CREATE POLICY vault_update_policy ON shout_vaults FOR UPDATE 
    USING (creator_address = current_setting('app.current_user', true));

-- Vault members visible to other members
CREATE POLICY vault_members_select_policy ON shout_vault_members FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM shout_vault_members m2 
            WHERE m2.vault_id = shout_vault_members.vault_id 
            AND m2.status = 'active'
        )
    );

-- Transactions visible to vault members
CREATE POLICY vault_txs_select_policy ON shout_vault_transactions FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM shout_vault_members 
            WHERE vault_id = shout_vault_transactions.vault_id 
            AND status = 'active'
        )
    );

-- Confirmations visible to vault members
CREATE POLICY vault_confirmations_select_policy ON shout_vault_confirmations FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM shout_vault_transactions t
            JOIN shout_vault_members m ON m.vault_id = t.vault_id
            WHERE t.id = shout_vault_confirmations.transaction_id
            AND m.status = 'active'
        )
    );

-- Comments
COMMENT ON TABLE shout_vaults IS 'Spritz Social Vaults - shared Safe multisig wallets';
COMMENT ON TABLE shout_vault_members IS 'Members/signers of social vaults';
COMMENT ON TABLE shout_vault_transactions IS 'Pending and executed vault transactions';
COMMENT ON TABLE shout_vault_confirmations IS 'Signatures for vault transactions';
COMMENT ON COLUMN shout_vaults.threshold IS 'Number of signatures required to execute transactions';
COMMENT ON COLUMN shout_vault_members.smart_wallet_address IS 'The signer address (Safe Smart Wallet) for this member';
