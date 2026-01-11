-- Passkey email recovery codes
-- Allows users to recover passkey accounts using their verified email

CREATE TABLE IF NOT EXISTS passkey_email_recovery (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    user_address TEXT NOT NULL,
    code TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    used_at TIMESTAMPTZ,
    attempts INTEGER DEFAULT 0,
    ip_address TEXT
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_passkey_email_recovery_email ON passkey_email_recovery(email);
CREATE INDEX IF NOT EXISTS idx_passkey_email_recovery_code ON passkey_email_recovery(code);
CREATE INDEX IF NOT EXISTS idx_passkey_email_recovery_created ON passkey_email_recovery(created_at);

-- Comment on table
COMMENT ON TABLE passkey_email_recovery IS 'Stores email verification codes for passkey account recovery. Codes expire after 10 minutes, max 3 per hour per email.';
