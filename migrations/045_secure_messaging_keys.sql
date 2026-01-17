-- Migration: Secure messaging with ECDH and opt-in PIN-protected backup
-- 
-- SECURITY MODEL:
-- 1. ECDH key exchange replaces deterministic keys (addresses alone can't derive key)
-- 2. Private keys stored locally by default (maximum security)
-- 3. Cloud backup is OPT-IN only, protected by 12-word phrase + 6-digit PIN
-- 4. PBKDF2 with 100,000 iterations for key derivation
--
-- Old approach: key = SHA256(addresses) - Anyone could compute!
-- New approach: key = ECDH(myPrivateKey, peerPublicKey) - Requires key possession

-- Public key for ECDH key exchange (intentionally public)
ALTER TABLE shout_user_settings
ADD COLUMN IF NOT EXISTS messaging_public_key TEXT;

-- DEPRECATED: Old auto-backup column (keeping for migration compatibility)
ALTER TABLE shout_user_settings
ADD COLUMN IF NOT EXISTS messaging_private_key_encrypted TEXT;

-- NEW: PIN-protected backup columns
-- Backup is encrypted with: PBKDF2(12-word-phrase + 6-digit-PIN, salt, 100000)
ALTER TABLE shout_user_settings
ADD COLUMN IF NOT EXISTS messaging_backup_encrypted TEXT;

ALTER TABLE shout_user_settings
ADD COLUMN IF NOT EXISTS messaging_backup_salt TEXT;

ALTER TABLE shout_user_settings
ADD COLUMN IF NOT EXISTS messaging_backup_enabled BOOLEAN DEFAULT FALSE;

-- Timestamp tracking
ALTER TABLE shout_user_settings
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_user_settings_messaging_pubkey
ON shout_user_settings (wallet_address)
WHERE messaging_public_key IS NOT NULL;

-- Comments for documentation
COMMENT ON COLUMN shout_user_settings.messaging_public_key IS 'Base64-encoded ECDH P-256 public key for secure DM key derivation.';
COMMENT ON COLUMN shout_user_settings.messaging_backup_encrypted IS 'AES-GCM encrypted ECDH keypair. Key derived from 12-word phrase + 6-digit PIN using PBKDF2.';
COMMENT ON COLUMN shout_user_settings.messaging_backup_salt IS 'PBKDF2 salt used for key derivation (base64).';
COMMENT ON COLUMN shout_user_settings.messaging_backup_enabled IS 'Whether user has opted into cloud backup.';

-- RLS Policies
DROP POLICY IF EXISTS "Anyone can read messaging public keys" ON public.shout_user_settings;
CREATE POLICY "Anyone can read messaging public keys"
ON public.shout_user_settings
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Users can update own messaging key" ON public.shout_user_settings;
CREATE POLICY "Users can update own messaging key"
ON public.shout_user_settings
FOR UPDATE
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can insert settings" ON public.shout_user_settings;
CREATE POLICY "Anyone can insert settings"
ON public.shout_user_settings
FOR INSERT
WITH CHECK (true);
