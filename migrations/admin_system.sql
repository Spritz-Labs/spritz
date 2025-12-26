-- Admin System Migration
-- Run this in your Supabase SQL editor

-- 1. Admins Table
CREATE TABLE IF NOT EXISTS shout_admins (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    wallet_address TEXT NOT NULL UNIQUE,
    added_by TEXT, -- wallet address of admin who added them
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_super_admin BOOLEAN DEFAULT false -- super admins can add/remove other admins
);

-- Insert initial admins (all as super admins)
INSERT INTO shout_admins (wallet_address, is_super_admin) VALUES
    ('0x3f22f740d41518f5017b76eed3a63eb14d2e1b07', true),
    ('0x007e483cf6df009db5ec571270b454764d954d95', true),
    ('0xa6f212d02510f55bafc534a5f9df6c9c71063990', true),
    ('0x89480c2e67876650b48622907ff5c48a569a36c7', true)
ON CONFLICT (wallet_address) DO UPDATE SET is_super_admin = true;

CREATE INDEX IF NOT EXISTS idx_admins_wallet ON shout_admins(wallet_address);

-- 2. Users Table (track all logins)
CREATE TABLE IF NOT EXISTS shout_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    wallet_address TEXT NOT NULL UNIQUE,
    wallet_type TEXT, -- 'metamask', 'walletconnect', 'coinbase', 'passkey', 'solana', etc.
    chain TEXT, -- 'ethereum', 'solana', etc.
    ens_name TEXT,
    username TEXT, -- spritz username if claimed
    first_login TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    login_count INTEGER DEFAULT 1,
    invite_code_used TEXT, -- if they used an invite code
    referred_by TEXT, -- wallet address of referrer
    is_banned BOOLEAN DEFAULT false,
    ban_reason TEXT,
    notes TEXT, -- admin notes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_wallet ON shout_users(wallet_address);
CREATE INDEX IF NOT EXISTS idx_users_invite_code ON shout_users(invite_code_used);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON shout_users(referred_by);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON shout_users(last_login DESC);

-- 3. Invite Codes Table
CREATE TABLE IF NOT EXISTS shout_invite_codes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    created_by TEXT NOT NULL, -- admin wallet address
    max_uses INTEGER DEFAULT 1, -- 0 = unlimited
    current_uses INTEGER DEFAULT 0,
    expires_at TIMESTAMP WITH TIME ZONE, -- NULL = never expires
    is_active BOOLEAN DEFAULT true,
    note TEXT, -- admin note about this code
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON shout_invite_codes(code);
CREATE INDEX IF NOT EXISTS idx_invite_codes_created_by ON shout_invite_codes(created_by);

-- 4. Invite Code Usage Tracking
CREATE TABLE IF NOT EXISTS shout_invite_code_usage (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code TEXT NOT NULL,
    used_by TEXT NOT NULL, -- wallet address
    used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(code, used_by)
);

CREATE INDEX IF NOT EXISTS idx_invite_usage_code ON shout_invite_code_usage(code);

-- 5. Admin Activity Log
CREATE TABLE IF NOT EXISTS shout_admin_activity (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    admin_address TEXT NOT NULL,
    action TEXT NOT NULL, -- 'add_admin', 'remove_admin', 'create_invite', 'ban_user', etc.
    target_address TEXT, -- affected wallet address (if applicable)
    details JSONB, -- additional details
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_activity_admin ON shout_admin_activity(admin_address);
CREATE INDEX IF NOT EXISTS idx_admin_activity_created ON shout_admin_activity(created_at DESC);

-- 6. Enable RLS
ALTER TABLE shout_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE shout_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE shout_invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE shout_invite_code_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE shout_admin_activity ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies (allow all for now - API will handle auth)
CREATE POLICY "Allow all on admins" ON shout_admins FOR ALL USING (true);
CREATE POLICY "Allow all on users" ON shout_users FOR ALL USING (true);
CREATE POLICY "Allow all on invite_codes" ON shout_invite_codes FOR ALL USING (true);
CREATE POLICY "Allow all on invite_usage" ON shout_invite_code_usage FOR ALL USING (true);
CREATE POLICY "Allow all on admin_activity" ON shout_admin_activity FOR ALL USING (true);

-- Done!
SELECT 'Admin system migration complete!' as status;

