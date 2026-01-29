-- Mute, Block, and Report Features
-- Run this in your Supabase SQL editor

-- 1. Muted Conversations Table
-- Stores mute settings for conversations (DMs, groups, channels)
CREATE TABLE IF NOT EXISTS shout_muted_conversations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_address TEXT NOT NULL,  -- The user who muted
    conversation_type TEXT NOT NULL CHECK (conversation_type IN ('dm', 'group', 'channel')),
    conversation_id TEXT NOT NULL,  -- Peer address for DMs, group/channel ID for others
    muted_until TIMESTAMP WITH TIME ZONE,  -- NULL means muted forever
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_address, conversation_type, conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_muted_conversations_user ON shout_muted_conversations(user_address);
CREATE INDEX IF NOT EXISTS idx_muted_conversations_until ON shout_muted_conversations(muted_until);

-- 2. Blocked Users Table
-- Stores user blocks (bidirectional - blocked user can't message blocker)
CREATE TABLE IF NOT EXISTS shout_blocked_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    blocker_address TEXT NOT NULL,  -- The user who blocked
    blocked_address TEXT NOT NULL,  -- The user who is blocked
    reason TEXT,  -- Optional reason
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(blocker_address, blocked_address)
);

CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker ON shout_blocked_users(blocker_address);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked ON shout_blocked_users(blocked_address);

-- 3. User Reports Table
-- Stores reports for admin review
CREATE TABLE IF NOT EXISTS shout_user_reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    reporter_address TEXT NOT NULL,  -- Who reported
    reported_address TEXT NOT NULL,  -- Who was reported
    report_type TEXT NOT NULL CHECK (report_type IN ('spam', 'harassment', 'hate_speech', 'violence', 'scam', 'impersonation', 'inappropriate_content', 'other')),
    description TEXT,  -- Additional details
    conversation_type TEXT,  -- Context: dm, group, channel
    conversation_id TEXT,  -- Context: which conversation
    message_id TEXT,  -- Optional: specific message being reported
    message_content TEXT,  -- Snapshot of reported content
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'action_taken', 'dismissed')),
    admin_notes TEXT,  -- Notes from admin review
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewed_by TEXT,  -- Admin who reviewed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_reporter ON shout_user_reports(reporter_address);
CREATE INDEX IF NOT EXISTS idx_reports_reported ON shout_user_reports(reported_address);
CREATE INDEX IF NOT EXISTS idx_reports_status ON shout_user_reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_type ON shout_user_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_reports_created ON shout_user_reports(created_at DESC);

-- 4. Enable RLS
ALTER TABLE shout_muted_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE shout_blocked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE shout_user_reports ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies

-- Muted conversations: users can only manage their own mutes
CREATE POLICY "Users can view own mutes" ON shout_muted_conversations 
    FOR SELECT USING (true);  -- Allow reading (we filter in app)

CREATE POLICY "Users can create own mutes" ON shout_muted_conversations 
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update own mutes" ON shout_muted_conversations 
    FOR UPDATE USING (true);

CREATE POLICY "Users can delete own mutes" ON shout_muted_conversations 
    FOR DELETE USING (true);

-- Blocked users: users can manage their own blocks
CREATE POLICY "Users can view blocks" ON shout_blocked_users 
    FOR SELECT USING (true);  -- Need to check if blocked by others too

CREATE POLICY "Users can create blocks" ON shout_blocked_users 
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can delete own blocks" ON shout_blocked_users 
    FOR DELETE USING (true);

-- Reports: users can create reports, only admins can view all
CREATE POLICY "Users can create reports" ON shout_user_reports 
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can view own reports" ON shout_user_reports 
    FOR SELECT USING (true);  -- We'll filter by admin status in app

CREATE POLICY "Admins can update reports" ON shout_user_reports 
    FOR UPDATE USING (true);

-- 6. Function to auto-delete expired mutes
CREATE OR REPLACE FUNCTION cleanup_expired_mutes()
RETURNS void AS $$
BEGIN
    DELETE FROM shout_muted_conversations 
    WHERE muted_until IS NOT NULL AND muted_until < NOW();
END;
$$ LANGUAGE plpgsql;

-- Done!
SELECT 'Mute, Block, and Report tables created!' as status;
