-- Global Events System
-- Events managed by Spritz admins, accessible by agents with the "events_access" capability

-- Main events table
CREATE TABLE IF NOT EXISTS shout_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Basic info
    name TEXT NOT NULL,
    description TEXT,
    event_type TEXT NOT NULL CHECK (event_type IN ('conference', 'hackathon', 'meetup', 'workshop', 'summit', 'party', 'networking', 'other')),
    
    -- Date & Time
    event_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    timezone TEXT DEFAULT 'UTC',
    is_multi_day BOOLEAN DEFAULT false,
    end_date DATE,
    
    -- Location
    venue TEXT,
    address TEXT,
    city TEXT,
    country TEXT,
    is_virtual BOOLEAN DEFAULT false,
    virtual_url TEXT,
    
    -- Organizer info
    organizer TEXT,
    organizer_logo_url TEXT,
    organizer_website TEXT,
    
    -- Links
    event_url TEXT,
    rsvp_url TEXT,
    ticket_url TEXT,
    
    -- Media
    banner_image_url TEXT,
    
    -- Tags & Categories
    tags TEXT[] DEFAULT '{}',
    blockchain_focus TEXT[], -- e.g., ['ethereum', 'solana', 'bitcoin']
    
    -- Source tracking
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'firecrawl', 'api', 'community')),
    source_url TEXT,
    source_id TEXT, -- Original ID from source
    
    -- Status & Visibility
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),
    is_featured BOOLEAN DEFAULT false,
    is_verified BOOLEAN DEFAULT false,
    
    -- Registration support
    registration_enabled BOOLEAN DEFAULT false,
    registration_fields JSONB DEFAULT '[]', -- Custom fields for registration
    max_attendees INTEGER,
    current_registrations INTEGER DEFAULT 0,
    
    -- Admin tracking
    created_by TEXT NOT NULL, -- Admin wallet address
    updated_by TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Prevent duplicates from scraping
    CONSTRAINT unique_event_source UNIQUE (source, source_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_events_date ON shout_events(event_date);
CREATE INDEX IF NOT EXISTS idx_events_type ON shout_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_status ON shout_events(status);
CREATE INDEX IF NOT EXISTS idx_events_city ON shout_events(city);
CREATE INDEX IF NOT EXISTS idx_events_featured ON shout_events(is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_events_created ON shout_events(created_at DESC);

-- Full text search index
CREATE INDEX IF NOT EXISTS idx_events_search ON shout_events USING gin(
    to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(city, '') || ' ' || coalesce(organizer, ''))
);

-- Enable RLS
ALTER TABLE shout_events ENABLE ROW LEVEL SECURITY;

-- Public can read published events
CREATE POLICY "Anyone can view published events"
ON shout_events FOR SELECT
USING (status = 'published');

-- Admins can manage events (handled by service role key)
CREATE POLICY "Admins can manage events"
ON shout_events FOR ALL
USING (true);

-- Event scrape sources - track URLs to scrape for events
CREATE TABLE IF NOT EXISTS shout_event_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Source info
    name TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    source_type TEXT NOT NULL CHECK (source_type IN ('conference_list', 'hackathon_list', 'event_calendar', 'organization_page')),
    
    -- Scraping config
    scrape_method TEXT DEFAULT 'firecrawl' CHECK (scrape_method IN ('basic', 'firecrawl')),
    scrape_interval_hours INTEGER DEFAULT 24,
    last_scraped_at TIMESTAMPTZ,
    next_scrape_at TIMESTAMPTZ,
    
    -- Filters
    event_types TEXT[] DEFAULT '{}', -- Filter to specific event types
    blockchain_focus TEXT[] DEFAULT '{}', -- Filter to specific blockchains
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    last_error TEXT,
    events_found INTEGER DEFAULT 0,
    
    -- Admin tracking
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE shout_event_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage event sources"
ON shout_event_sources FOR ALL
USING (true);

-- User event registrations (for Spritz-hosted registrations)
CREATE TABLE IF NOT EXISTS shout_event_user_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES shout_events(id) ON DELETE CASCADE,
    
    -- User info
    wallet_address TEXT NOT NULL,
    registration_data JSONB, -- Custom field responses
    
    -- Status
    status TEXT DEFAULT 'registered' CHECK (status IN ('registered', 'waitlisted', 'checked_in', 'cancelled', 'no_show')),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- One registration per user per event
    CONSTRAINT unique_user_event_registration UNIQUE (event_id, wallet_address)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_registrations_event ON shout_event_user_registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_user_registrations_user ON shout_event_user_registrations(wallet_address);

-- Enable RLS
ALTER TABLE shout_event_user_registrations ENABLE ROW LEVEL SECURITY;

-- Users can view their own registrations
CREATE POLICY "Users can view own registrations"
ON shout_event_user_registrations FOR SELECT
USING (wallet_address = current_setting('request.jwt.claims', true)::json->>'wallet_address');

-- Users can insert their own registrations
CREATE POLICY "Users can register for events"
ON shout_event_user_registrations FOR INSERT
WITH CHECK (wallet_address = current_setting('request.jwt.claims', true)::json->>'wallet_address');

-- Trigger to update event registration count
CREATE OR REPLACE FUNCTION update_event_registration_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE shout_events 
        SET current_registrations = current_registrations + 1
        WHERE id = NEW.event_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE shout_events 
        SET current_registrations = current_registrations - 1
        WHERE id = OLD.event_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_event_registration_count
AFTER INSERT OR DELETE ON shout_event_user_registrations
FOR EACH ROW EXECUTE FUNCTION update_event_registration_count();

-- Add events_access capability to agents
ALTER TABLE shout_agents 
ADD COLUMN IF NOT EXISTS events_access BOOLEAN DEFAULT false;

COMMENT ON TABLE shout_events IS 'Global events database managed by Spritz admins';
COMMENT ON TABLE shout_event_sources IS 'URLs to scrape for event discovery';
COMMENT ON TABLE shout_event_user_registrations IS 'User registrations for Spritz-hosted events';
COMMENT ON COLUMN shout_agents.events_access IS 'Whether agent can access the global events database';
