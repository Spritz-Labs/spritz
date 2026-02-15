-- DM Read Timestamps
-- Stores per-conversation "last read at" timestamps for reliable unread tracking.
-- This supplements per-message read receipts and prevents "ghost unread" bugs
-- where in-memory read state was lost on reload.

CREATE TABLE IF NOT EXISTS shout_read_receipts_dm (
    reader_address TEXT NOT NULL,
    peer_address TEXT NOT NULL,
    last_read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (reader_address, peer_address)
);

CREATE INDEX IF NOT EXISTS idx_read_receipts_dm_reader ON shout_read_receipts_dm(reader_address);

-- Enable RLS
ALTER TABLE shout_read_receipts_dm ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on read_receipts_dm" ON shout_read_receipts_dm FOR ALL USING (true);

SELECT 'DM read timestamps migration complete!' as status;
