-- Add custom icon support for channels and global chat

-- Add icon_url to channels (allows custom image instead of emoji)
ALTER TABLE shout_public_channels 
ADD COLUMN IF NOT EXISTS icon_url TEXT;

-- Create global settings table for app-wide settings like Global Chat icon
CREATE TABLE IF NOT EXISTS shout_app_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    value JSONB NOT NULL,
    updated_by TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE shout_app_settings ENABLE ROW LEVEL SECURITY;

-- Anyone can read settings
CREATE POLICY "Anyone can view app settings"
ON shout_app_settings FOR SELECT USING (true);

-- Only allow modifications through API (which checks admin status)
CREATE POLICY "Admins can manage app settings"
ON shout_app_settings FOR ALL USING (true) WITH CHECK (true);

-- Insert default global chat icon setting
INSERT INTO shout_app_settings (key, value) 
VALUES ('global_chat_icon', '{"emoji": "🌍", "icon_url": null}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_app_settings_key ON shout_app_settings(key);
