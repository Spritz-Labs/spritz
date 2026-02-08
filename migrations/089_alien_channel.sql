-- Add "Alien" official channel
INSERT INTO shout_public_channels (name, description, emoji, category, is_official, is_active) VALUES
('Alien', 'Extraterrestrial life, UFOs, and cosmic mysteries.', '👽', 'entertainment', true, true)
ON CONFLICT (name) DO NOTHING;
