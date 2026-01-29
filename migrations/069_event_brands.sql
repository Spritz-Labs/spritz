-- Event brands: one per user by default, events can be associated with a brand
CREATE TABLE IF NOT EXISTS shout_event_brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address TEXT NOT NULL,
    name TEXT NOT NULL,
    logo_url TEXT,
    website TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_wallet_brand UNIQUE (wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_event_brands_wallet ON shout_event_brands(wallet_address);

ALTER TABLE shout_event_brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view brands"
ON shout_event_brands FOR SELECT USING (true);

CREATE POLICY "Users can insert their own brand"
ON shout_event_brands FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their own brand"
ON shout_event_brands FOR UPDATE USING (true);

-- Add brand_id to events (nullable; user-created events can be under a brand)
ALTER TABLE shout_events
ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES shout_event_brands(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_events_brand ON shout_events(brand_id) WHERE brand_id IS NOT NULL;

COMMENT ON TABLE shout_event_brands IS 'One brand per user; events can be posted under a brand';
COMMENT ON COLUMN shout_events.brand_id IS 'Optional brand (organizer) for this event';
