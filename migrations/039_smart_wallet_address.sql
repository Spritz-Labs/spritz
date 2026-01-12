-- Add Smart Wallet (Safe) address to users table
-- This implements the dual address system:
-- - wallet_address: Spritz ID (identity) - passkey hash, email EOA, or connected wallet
-- - smart_wallet_address: Safe Smart Account (actual wallet for transactions)

-- Add smart_wallet_address column to shout_users
ALTER TABLE shout_users 
ADD COLUMN IF NOT EXISTS smart_wallet_address VARCHAR(42);

-- Add index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_users_smart_wallet ON shout_users(smart_wallet_address) 
WHERE smart_wallet_address IS NOT NULL;

-- Add comment explaining the dual address system
COMMENT ON COLUMN shout_users.wallet_address IS 'Spritz ID - User identity address (passkey-derived hash, email EOA, or connected wallet)';
COMMENT ON COLUMN shout_users.smart_wallet_address IS 'Safe Smart Account address - Actual wallet for sending/receiving tokens (ERC-4337)';

-- Update shout_wallets table to track smart wallets
ALTER TABLE shout_wallets
ADD COLUMN IF NOT EXISTS is_smart_wallet BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS smart_wallet_chain_id INTEGER,
ADD COLUMN IF NOT EXISTS smart_wallet_deployed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS signer_address VARCHAR(42);

-- Add index for smart wallet lookups
CREATE INDEX IF NOT EXISTS idx_shout_wallets_smart ON shout_wallets(is_smart_wallet) 
WHERE is_smart_wallet = true;

-- Comment on new columns
COMMENT ON COLUMN shout_wallets.is_smart_wallet IS 'Whether this is a Safe Smart Account (ERC-4337)';
COMMENT ON COLUMN shout_wallets.smart_wallet_chain_id IS 'Primary chain ID for this smart wallet';
COMMENT ON COLUMN shout_wallets.smart_wallet_deployed IS 'Whether the smart wallet has been deployed on-chain';
COMMENT ON COLUMN shout_wallets.signer_address IS 'EOA address that owns/signs for this smart wallet';

SELECT 'Smart wallet columns added successfully!' as status;
