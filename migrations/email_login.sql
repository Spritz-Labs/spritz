-- Create table for email login verification codes
CREATE TABLE IF NOT EXISTS shout_email_login (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_email_login_email ON shout_email_login(email);
CREATE INDEX IF NOT EXISTS idx_email_login_code ON shout_email_login(code);
CREATE INDEX IF NOT EXISTS idx_email_login_expires ON shout_email_login(expires_at);

-- Add RLS policies
ALTER TABLE shout_email_login ENABLE ROW LEVEL SECURITY;

-- Allow service role to manage all records
CREATE POLICY "Service role can manage email login"
    ON shout_email_login
    FOR ALL
    USING (auth.role() = 'service_role');

-- Clean up expired codes (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_email_login_codes()
RETURNS void AS $$
BEGIN
    DELETE FROM shout_email_login
    WHERE expires_at < NOW() - INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql;

