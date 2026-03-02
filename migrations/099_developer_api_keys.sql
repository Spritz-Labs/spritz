-- Developer API keys for SDK access
-- Allows third-party apps to authenticate against Spritz APIs

CREATE TABLE IF NOT EXISTS shout_developer_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    developer_address TEXT NOT NULL,
    api_key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT 'Default',
    scopes TEXT[] NOT NULL DEFAULT ARRAY['read', 'write'],
    rate_limit_per_minute INT NOT NULL DEFAULT 60,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_developer_keys_api_key ON shout_developer_keys (api_key) WHERE is_active = true;
CREATE INDEX idx_developer_keys_developer ON shout_developer_keys (developer_address);

ALTER TABLE shout_developer_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own API keys"
    ON shout_developer_keys FOR SELECT
    USING (true);

CREATE POLICY "Users can insert their own API keys"
    ON shout_developer_keys FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Users can update their own API keys"
    ON shout_developer_keys FOR UPDATE
    USING (true);
