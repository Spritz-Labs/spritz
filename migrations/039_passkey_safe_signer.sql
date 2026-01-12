-- Add P256 public key coordinates for Safe passkey signer
-- These coordinates are needed to create Safe WebAuthn signers

-- Add columns for the P256 (secp256r1) public key coordinates
ALTER TABLE passkey_credentials 
ADD COLUMN IF NOT EXISTS public_key_x TEXT,
ADD COLUMN IF NOT EXISTS public_key_y TEXT;

-- Add column for the Safe signer address (computed from public key coordinates)
ALTER TABLE passkey_credentials 
ADD COLUMN IF NOT EXISTS safe_signer_address TEXT;

-- Comment explaining the columns
COMMENT ON COLUMN passkey_credentials.public_key_x IS 'X coordinate of P256 public key (hex encoded, 32 bytes)';
COMMENT ON COLUMN passkey_credentials.public_key_y IS 'Y coordinate of P256 public key (hex encoded, 32 bytes)';
COMMENT ON COLUMN passkey_credentials.safe_signer_address IS 'Safe WebAuthn signer contract address (derived from public key)';

-- Index for looking up by Safe signer address
CREATE INDEX IF NOT EXISTS idx_passkey_safe_signer_address 
ON passkey_credentials(safe_signer_address) 
WHERE safe_signer_address IS NOT NULL;
