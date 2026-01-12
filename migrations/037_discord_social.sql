-- Add Discord username to socials table
ALTER TABLE shout_socials
ADD COLUMN IF NOT EXISTS discord_username VARCHAR(100);

-- Add index for Discord username
CREATE INDEX IF NOT EXISTS idx_shout_socials_discord_username 
ON shout_socials(discord_username) 
WHERE discord_username IS NOT NULL;
