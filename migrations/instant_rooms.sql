-- Instant Rooms Migration
-- Creates a table for instant/quick meeting rooms that anyone can join without login

CREATE TABLE IF NOT EXISTS shout_instant_rooms (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id TEXT NOT NULL UNIQUE,  -- Huddle01 room ID
    host_wallet_address TEXT NOT NULL,  -- Creator's wallet address
    title TEXT DEFAULT 'Quick Meeting',  -- Room title
    max_participants INTEGER DEFAULT 4,  -- Max number of participants
    join_code TEXT UNIQUE,  -- Short code for easy sharing (e.g., 'ABC123')
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'ended', 'expired')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),  -- Rooms expire after 24 hours
    ended_at TIMESTAMPTZ,
    participant_count INTEGER DEFAULT 0
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_instant_rooms_host ON shout_instant_rooms(host_wallet_address);
CREATE INDEX IF NOT EXISTS idx_instant_rooms_join_code ON shout_instant_rooms(join_code) WHERE join_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_instant_rooms_status ON shout_instant_rooms(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_instant_rooms_expires ON shout_instant_rooms(expires_at) WHERE status = 'active';

-- Function to generate short join codes
CREATE OR REPLACE FUNCTION generate_join_code()
RETURNS TEXT AS $$
DECLARE
    chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- Excluding confusing chars like 0, O, I, 1
    result TEXT := '';
    i INTEGER;
BEGIN
    FOR i IN 1..6 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate join code on insert
CREATE OR REPLACE FUNCTION set_join_code()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.join_code IS NULL THEN
        -- Keep trying until we get a unique code
        LOOP
            NEW.join_code := generate_join_code();
            EXIT WHEN NOT EXISTS (SELECT 1 FROM shout_instant_rooms WHERE join_code = NEW.join_code);
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_join_code ON shout_instant_rooms;
CREATE TRIGGER trigger_set_join_code
BEFORE INSERT ON shout_instant_rooms
FOR EACH ROW
EXECUTE FUNCTION set_join_code();

-- Comments
COMMENT ON TABLE shout_instant_rooms IS 'Quick meeting rooms that guests can join without authentication';
COMMENT ON COLUMN shout_instant_rooms.join_code IS 'Short alphanumeric code for easy sharing (auto-generated)';
COMMENT ON COLUMN shout_instant_rooms.max_participants IS 'Maximum number of people allowed in the room (default 4)';

