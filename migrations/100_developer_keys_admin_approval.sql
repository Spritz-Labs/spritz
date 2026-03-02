-- API keys require admin approval before they can be used (v1 limitation)
-- approved_at NULL = pending; non-null = approved by admin

ALTER TABLE shout_developer_keys
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

COMMENT ON COLUMN shout_developer_keys.approved_at IS 'When set by an admin, the key can be used. NULL = pending approval.';

CREATE INDEX IF NOT EXISTS idx_developer_keys_approved
    ON shout_developer_keys (approved_at) WHERE approved_at IS NULL;
