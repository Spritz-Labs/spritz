-- Update vault confirmations to store actual cryptographic signatures
-- Required for multi-sig execution

-- Add signature column to store the actual cryptographic signature
ALTER TABLE shout_vault_confirmations
ADD COLUMN IF NOT EXISTS signature TEXT;

-- Add safe_tx_hash to track which hash was signed
ALTER TABLE shout_vault_confirmations
ADD COLUMN IF NOT EXISTS safe_tx_hash TEXT;
