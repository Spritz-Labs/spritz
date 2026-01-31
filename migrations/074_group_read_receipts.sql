-- Group read receipts: last read message per user per group
CREATE TABLE IF NOT EXISTS shout_group_read_receipts (
    group_id TEXT NOT NULL,
    user_address TEXT NOT NULL,
    last_read_message_id TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (group_id, user_address)
);

CREATE INDEX IF NOT EXISTS idx_group_read_receipts_group ON shout_group_read_receipts(group_id);

ALTER TABLE shout_group_read_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view group read receipts"
    ON shout_group_read_receipts FOR SELECT USING (true);

CREATE POLICY "Users can update own read receipt"
    ON shout_group_read_receipts FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update own read receipt (upsert)"
    ON shout_group_read_receipts FOR UPDATE USING (true);
