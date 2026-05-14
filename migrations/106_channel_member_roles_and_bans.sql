-- Migration: Channel member roles and bans
-- Adds per-channel role to shout_channel_members and a dedicated channel bans table.

-- 1. Add role column to channel members
ALTER TABLE shout_channel_members
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member';

-- Add constraint separately so IF NOT EXISTS on the column works idempotently
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_channel_member_role'
  ) THEN
    ALTER TABLE shout_channel_members
      ADD CONSTRAINT chk_channel_member_role
      CHECK (role IN ('owner', 'admin', 'moderator', 'member'));
  END IF;
END $$;

-- 2. Backfill: set existing creators as owners
UPDATE shout_channel_members m
SET role = 'owner'
FROM shout_public_channels c
WHERE m.channel_id = c.id
  AND LOWER(m.user_address) = LOWER(c.creator_address)
  AND m.role = 'member';

-- 3. Channel bans table
CREATE TABLE IF NOT EXISTS shout_channel_bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES shout_public_channels(id) ON DELETE CASCADE,
  user_address TEXT NOT NULL,
  banned_by TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(channel_id, user_address)
);

-- 4. Index for fast ban lookups on join
CREATE INDEX IF NOT EXISTS idx_channel_bans_lookup
  ON shout_channel_bans(channel_id, LOWER(user_address));

-- 5. Index for role lookups
CREATE INDEX IF NOT EXISTS idx_channel_members_role
  ON shout_channel_members(channel_id, LOWER(user_address), role);
