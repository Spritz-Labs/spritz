-- Error logging table for tracking Safe/passkey and other critical errors
-- This allows us to see errors in an admin UI instead of digging through Vercel logs

CREATE TABLE IF NOT EXISTS shout_error_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Error classification
    error_type TEXT NOT NULL, -- 'safe_transaction', 'passkey_signing', 'wallet_connect', etc.
    error_code TEXT, -- e.g., 'GS026', 'WEBAUTHN_FAILED', etc.
    error_message TEXT NOT NULL,
    
    -- User context (optional - some errors may not have a user)
    user_address TEXT,
    user_email TEXT,
    
    -- Technical details
    stack_trace TEXT,
    request_path TEXT,
    request_method TEXT,
    
    -- Full context as JSON (for detailed debugging)
    context JSONB DEFAULT '{}'::jsonb,
    
    -- Device/browser info
    user_agent TEXT,
    ip_address TEXT,
    
    -- Resolution tracking
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_by TEXT,
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Index for common queries
    CONSTRAINT error_type_check CHECK (error_type IN (
        'safe_transaction',
        'passkey_signing', 
        'passkey_registration',
        'wallet_connect',
        'wallet_send',
        'vault_transaction',
        'api_error',
        'other'
    ))
);

-- Indexes for efficient querying
CREATE INDEX idx_error_logs_created_at ON shout_error_logs(created_at DESC);
CREATE INDEX idx_error_logs_user_address ON shout_error_logs(user_address) WHERE user_address IS NOT NULL;
CREATE INDEX idx_error_logs_error_type ON shout_error_logs(error_type);
CREATE INDEX idx_error_logs_error_code ON shout_error_logs(error_code) WHERE error_code IS NOT NULL;
CREATE INDEX idx_error_logs_unresolved ON shout_error_logs(is_resolved, created_at DESC) WHERE is_resolved = FALSE;

-- Enable RLS
ALTER TABLE shout_error_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read error logs (via service role key in API)
-- No direct client access
