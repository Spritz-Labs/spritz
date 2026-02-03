-- Password-protected private groups
-- When enabled, the group encryption key is derived from a user-chosen password (not stored).
-- Only password_protected, password_salt, and password_hash are stored; symmetric_key is null for these groups.

-- 1. shout_groups: add password protection columns; make symmetric_key nullable
ALTER TABLE shout_groups
ADD COLUMN IF NOT EXISTS password_protected BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS password_salt TEXT,
ADD COLUMN IF NOT EXISTS password_hash TEXT;

ALTER TABLE shout_groups
ALTER COLUMN symmetric_key DROP NOT NULL;

COMMENT ON COLUMN shout_groups.password_protected IS 'If true, encryption key is derived from password; symmetric_key is not stored.';
COMMENT ON COLUMN shout_groups.password_salt IS 'Random salt for PBKDF2 key derivation (hex).';
COMMENT ON COLUMN shout_groups.password_hash IS 'Hash for verifying password on join (hex).';

-- 2. shout_group_invitations: add password protection columns (so invitee can verify + derive key)
ALTER TABLE shout_group_invitations
ADD COLUMN IF NOT EXISTS password_protected BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS password_salt TEXT,
ADD COLUMN IF NOT EXISTS password_hash TEXT;

COMMENT ON COLUMN shout_group_invitations.password_protected IS 'If true, invitee must enter password to derive key; symmetric_key is not sent.';
