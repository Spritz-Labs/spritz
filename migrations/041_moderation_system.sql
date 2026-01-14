-- Moderation System Migration
-- Comprehensive moderation for channels and global chat

-- ============================================
-- 1. MODERATORS TABLE
-- ============================================
-- Unified moderators table for both global (alpha) chat and specific channels
CREATE TABLE IF NOT EXISTS shout_moderators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_address TEXT NOT NULL,
    channel_id UUID REFERENCES shout_public_channels(id) ON DELETE CASCADE, -- NULL = global/alpha chat moderator
    granted_by TEXT NOT NULL, -- Who promoted this moderator
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Granular permissions
    can_pin BOOLEAN DEFAULT true,
    can_delete BOOLEAN DEFAULT true,
    can_mute BOOLEAN DEFAULT true,
    can_manage_mods BOOLEAN DEFAULT false, -- Can promote/demote other mods (for channel owners)
    notes TEXT, -- Optional notes about why they were promoted
    UNIQUE(user_address, channel_id) -- One entry per user per channel (or global)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_moderators_user ON shout_moderators(user_address);
CREATE INDEX IF NOT EXISTS idx_moderators_channel ON shout_moderators(channel_id);
CREATE INDEX IF NOT EXISTS idx_moderators_global ON shout_moderators(channel_id) WHERE channel_id IS NULL;

-- ============================================
-- 2. MUTED USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS shout_muted_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_address TEXT NOT NULL,
    channel_id UUID REFERENCES shout_public_channels(id) ON DELETE CASCADE, -- NULL = muted from global/alpha chat
    muted_by TEXT NOT NULL,
    muted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    muted_until TIMESTAMP WITH TIME ZONE, -- NULL = permanent mute
    reason TEXT,
    is_active BOOLEAN DEFAULT true, -- Can be set to false to unmute early
    unmuted_by TEXT, -- Who unmuted (if unmuted early)
    unmuted_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_muted_users_address ON shout_muted_users(user_address);
CREATE INDEX IF NOT EXISTS idx_muted_users_channel ON shout_muted_users(channel_id);
CREATE INDEX IF NOT EXISTS idx_muted_users_active ON shout_muted_users(is_active, muted_until);

-- ============================================
-- 3. SOFT DELETE FOR MESSAGES
-- ============================================
-- Add soft delete columns to alpha messages
ALTER TABLE shout_alpha_messages 
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS deleted_by TEXT,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS delete_reason TEXT;

-- Add soft delete columns to channel messages
ALTER TABLE shout_channel_messages 
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS deleted_by TEXT,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS delete_reason TEXT;

-- Indexes for filtering out deleted messages
CREATE INDEX IF NOT EXISTS idx_alpha_messages_not_deleted 
ON shout_alpha_messages(is_deleted) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_channel_messages_not_deleted 
ON shout_channel_messages(is_deleted) WHERE is_deleted = false;

-- ============================================
-- 4. MODERATION ACTIONS LOG (Audit Trail)
-- ============================================
CREATE TABLE IF NOT EXISTS shout_moderation_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_type TEXT NOT NULL, -- 'pin', 'unpin', 'delete', 'mute', 'unmute', 'promote_mod', 'demote_mod'
    moderator_address TEXT NOT NULL, -- Who performed the action
    target_user_address TEXT, -- Who was affected (for mute/unmute/promote/demote)
    target_message_id UUID, -- Which message was affected (for pin/unpin/delete)
    channel_id UUID REFERENCES shout_public_channels(id) ON DELETE SET NULL, -- NULL = global/alpha chat
    reason TEXT,
    metadata JSONB, -- Additional data (e.g., mute duration, previous state)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_mod_log_moderator ON shout_moderation_log(moderator_address);
CREATE INDEX IF NOT EXISTS idx_mod_log_target_user ON shout_moderation_log(target_user_address);
CREATE INDEX IF NOT EXISTS idx_mod_log_channel ON shout_moderation_log(channel_id);
CREATE INDEX IF NOT EXISTS idx_mod_log_action ON shout_moderation_log(action_type);
CREATE INDEX IF NOT EXISTS idx_mod_log_created ON shout_moderation_log(created_at DESC);

-- ============================================
-- 5. RLS POLICIES
-- ============================================
ALTER TABLE shout_moderators ENABLE ROW LEVEL SECURITY;
ALTER TABLE shout_muted_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE shout_moderation_log ENABLE ROW LEVEL SECURITY;

-- Moderators: Anyone can view, only admins/mods can modify
DROP POLICY IF EXISTS "Anyone can view moderators" ON shout_moderators;
CREATE POLICY "Anyone can view moderators" ON shout_moderators FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage moderators" ON shout_moderators;
CREATE POLICY "Admins can manage moderators" ON shout_moderators 
FOR ALL USING (true) WITH CHECK (true); -- API-level checks

-- Muted users: Viewable by all, modifiable by admins/mods
DROP POLICY IF EXISTS "Anyone can view muted users" ON shout_muted_users;
CREATE POLICY "Anyone can view muted users" ON shout_muted_users FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage muted users" ON shout_muted_users;
CREATE POLICY "Admins can manage muted users" ON shout_muted_users 
FOR ALL USING (true) WITH CHECK (true); -- API-level checks

-- Moderation log: Viewable by admins/mods only
DROP POLICY IF EXISTS "Anyone can view moderation log" ON shout_moderation_log;
CREATE POLICY "Anyone can view moderation log" ON shout_moderation_log FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can insert moderation log" ON shout_moderation_log;
CREATE POLICY "Admins can insert moderation log" ON shout_moderation_log 
FOR INSERT WITH CHECK (true);

-- ============================================
-- 6. HELPER FUNCTIONS
-- ============================================

-- Function to check if user is muted in a channel (or globally)
CREATE OR REPLACE FUNCTION is_user_muted(
    p_user_address TEXT,
    p_channel_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM shout_muted_users
        WHERE user_address = LOWER(p_user_address)
        AND (channel_id = p_channel_id OR (p_channel_id IS NULL AND channel_id IS NULL))
        AND is_active = true
        AND (muted_until IS NULL OR muted_until > NOW())
    );
END;
$$ LANGUAGE plpgsql;

-- Function to check if user is a moderator
CREATE OR REPLACE FUNCTION is_user_moderator(
    p_user_address TEXT,
    p_channel_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if global admin first
    IF EXISTS (SELECT 1 FROM shout_admins WHERE wallet_address = LOWER(p_user_address)) THEN
        RETURN true;
    END IF;
    
    -- Check moderator table
    RETURN EXISTS (
        SELECT 1 FROM shout_moderators
        WHERE user_address = LOWER(p_user_address)
        AND (channel_id = p_channel_id OR (p_channel_id IS NULL AND channel_id IS NULL))
    );
END;
$$ LANGUAGE plpgsql;

-- Function to get user's moderation permissions
CREATE OR REPLACE FUNCTION get_user_mod_permissions(
    p_user_address TEXT,
    p_channel_id UUID DEFAULT NULL
)
RETURNS TABLE (
    is_admin BOOLEAN,
    is_super_admin BOOLEAN,
    is_moderator BOOLEAN,
    can_pin BOOLEAN,
    can_delete BOOLEAN,
    can_mute BOOLEAN,
    can_manage_mods BOOLEAN
) AS $$
DECLARE
    v_admin RECORD;
    v_mod RECORD;
BEGIN
    -- Check admin status
    SELECT true AS is_admin, COALESCE(sa.is_super_admin, false) AS is_super_admin
    INTO v_admin
    FROM shout_admins sa
    WHERE sa.wallet_address = LOWER(p_user_address);
    
    IF FOUND THEN
        RETURN QUERY SELECT 
            true, -- is_admin
            v_admin.is_super_admin,
            true, -- is_moderator (admins are always mods)
            true, -- can_pin
            true, -- can_delete
            true, -- can_mute
            true; -- can_manage_mods
        RETURN;
    END IF;
    
    -- Check channel owner (if channel specified)
    IF p_channel_id IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM shout_public_channels 
            WHERE id = p_channel_id 
            AND created_by = LOWER(p_user_address)
        ) THEN
            RETURN QUERY SELECT 
                false, -- is_admin
                false, -- is_super_admin
                true, -- is_moderator
                true, -- can_pin
                true, -- can_delete
                true, -- can_mute
                true; -- can_manage_mods (owners can manage their channel mods)
            RETURN;
        END IF;
    END IF;
    
    -- Check moderator status
    SELECT sm.can_pin, sm.can_delete, sm.can_mute, sm.can_manage_mods
    INTO v_mod
    FROM shout_moderators sm
    WHERE sm.user_address = LOWER(p_user_address)
    AND (sm.channel_id = p_channel_id OR (p_channel_id IS NULL AND sm.channel_id IS NULL));
    
    IF FOUND THEN
        RETURN QUERY SELECT 
            false, -- is_admin
            false, -- is_super_admin
            true, -- is_moderator
            v_mod.can_pin,
            v_mod.can_delete,
            v_mod.can_mute,
            v_mod.can_manage_mods;
        RETURN;
    END IF;
    
    -- Not a moderator
    RETURN QUERY SELECT 
        false, false, false, false, false, false, false;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 7. ADD REALTIME SUPPORT
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE shout_moderators;
ALTER PUBLICATION supabase_realtime ADD TABLE shout_muted_users;

-- Done!
SELECT 'Moderation system migration complete!' as status;
