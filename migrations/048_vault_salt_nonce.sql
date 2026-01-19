-- Add salt_nonce column to shout_vaults for deterministic Safe address recreation
-- This stores the salt used when calculating the Safe address via CREATE2

ALTER TABLE shout_vaults
ADD COLUMN IF NOT EXISTS salt_nonce TEXT;

-- Add comment explaining the column
COMMENT ON COLUMN shout_vaults.salt_nonce IS 'Salt nonce used for deterministic Safe address calculation via CREATE2';
