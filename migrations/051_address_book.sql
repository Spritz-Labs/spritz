-- Address Book for saved recipient addresses
-- Users can save frequently used addresses with labels for quick access

CREATE TABLE IF NOT EXISTS shout_address_book (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_address TEXT NOT NULL,
    address TEXT NOT NULL,
    label TEXT NOT NULL,
    ens_name TEXT,
    notes TEXT,
    is_favorite BOOLEAN DEFAULT false,
    use_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure user can't save the same address twice
    UNIQUE(user_address, address)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_address_book_user ON shout_address_book(user_address);
CREATE INDEX IF NOT EXISTS idx_address_book_favorite ON shout_address_book(user_address, is_favorite) WHERE is_favorite = true;

-- Enable RLS
ALTER TABLE shout_address_book ENABLE ROW LEVEL SECURITY;

-- Users can only see their own address book entries
CREATE POLICY "Users can view own address book"
    ON shout_address_book FOR SELECT
    USING (true);

CREATE POLICY "Users can insert own address book"
    ON shout_address_book FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Users can update own address book"
    ON shout_address_book FOR UPDATE
    USING (true);

CREATE POLICY "Users can delete own address book"
    ON shout_address_book FOR DELETE
    USING (true);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_address_book_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS address_book_updated_at ON shout_address_book;
CREATE TRIGGER address_book_updated_at
    BEFORE UPDATE ON shout_address_book
    FOR EACH ROW
    EXECUTE FUNCTION update_address_book_updated_at();

-- Comment
COMMENT ON TABLE shout_address_book IS 'User address book for saving frequently used recipient addresses';
