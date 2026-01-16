-- Profile Widgets System (Bento-style customizable profiles)
-- This enables users to create customizable profile pages with draggable widgets

-- Profile widgets table - stores individual widget configurations
CREATE TABLE IF NOT EXISTS profile_widgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_address TEXT NOT NULL,
    widget_type TEXT NOT NULL, -- 'map', 'image', 'text', 'social_embed', 'nft', 'link', 'spotify', 'github', 'video', 'countdown', 'stats'
    size TEXT NOT NULL DEFAULT '1x1', -- '1x1', '2x1', '1x2', '2x2', '4x1', '4x2'
    position INTEGER NOT NULL DEFAULT 0, -- Order in the grid (0-indexed)
    config JSONB NOT NULL DEFAULT '{}', -- Widget-specific configuration
    is_visible BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Profile themes table - stores user's profile theme/styling
CREATE TABLE IF NOT EXISTS profile_themes (
    user_address TEXT PRIMARY KEY,
    background_type TEXT NOT NULL DEFAULT 'solid', -- 'solid', 'gradient', 'image', 'mesh'
    background_value TEXT NOT NULL DEFAULT '#09090b', -- Color, gradient CSS, or image URL
    accent_color TEXT NOT NULL DEFAULT '#f97316', -- Primary accent color (orange default)
    secondary_color TEXT, -- Optional secondary color
    text_color TEXT NOT NULL DEFAULT '#ffffff',
    card_style TEXT NOT NULL DEFAULT 'rounded', -- 'rounded', 'sharp', 'pill'
    card_background TEXT NOT NULL DEFAULT 'rgba(24, 24, 27, 0.8)', -- Card bg with opacity
    card_border TEXT DEFAULT 'rgba(63, 63, 70, 0.5)', -- Card border color
    font_family TEXT NOT NULL DEFAULT 'system', -- 'system', 'inter', 'mono', 'serif'
    show_spritz_badge BOOLEAN NOT NULL DEFAULT true,
    custom_css TEXT, -- Advanced: custom CSS overrides
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_profile_widgets_user ON profile_widgets(user_address);
CREATE INDEX IF NOT EXISTS idx_profile_widgets_position ON profile_widgets(user_address, position);
CREATE INDEX IF NOT EXISTS idx_profile_widgets_type ON profile_widgets(widget_type);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_profile_widgets_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profile_widgets_timestamp
    BEFORE UPDATE ON profile_widgets
    FOR EACH ROW
    EXECUTE FUNCTION update_profile_widgets_timestamp();

CREATE OR REPLACE FUNCTION update_profile_themes_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profile_themes_timestamp
    BEFORE UPDATE ON profile_themes
    FOR EACH ROW
    EXECUTE FUNCTION update_profile_themes_timestamp();

-- RLS Policies
ALTER TABLE profile_widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_themes ENABLE ROW LEVEL SECURITY;

-- Anyone can read visible widgets (for public profiles)
CREATE POLICY "Anyone can view visible widgets"
    ON profile_widgets FOR SELECT
    USING (is_visible = true);

-- Anyone can read themes (for public profiles)
CREATE POLICY "Anyone can view themes"
    ON profile_themes FOR SELECT
    USING (true);

-- Comments for documentation
COMMENT ON TABLE profile_widgets IS 'Stores customizable profile widgets for Bento-style user pages';
COMMENT ON TABLE profile_themes IS 'Stores profile theme/styling preferences';
COMMENT ON COLUMN profile_widgets.widget_type IS 'Type of widget: map, image, text, social_embed, nft, link, spotify, github, video, countdown, stats';
COMMENT ON COLUMN profile_widgets.size IS 'Widget size in grid units: 1x1, 2x1, 1x2, 2x2, 4x1, 4x2';
COMMENT ON COLUMN profile_widgets.config IS 'JSON configuration specific to widget type';
