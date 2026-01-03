-- Add scheduling settings to user_settings table
-- Run this in your Supabase SQL Editor

-- Add scheduling configuration columns to shout_user_settings
ALTER TABLE shout_user_settings 
ADD COLUMN IF NOT EXISTS scheduling_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS scheduling_price_cents INTEGER DEFAULT 0,  -- 0 = free, >0 = paid
ADD COLUMN IF NOT EXISTS scheduling_network TEXT DEFAULT 'base',  -- 'base' or 'base-sepolia'
ADD COLUMN IF NOT EXISTS scheduling_wallet_address TEXT,  -- Wallet to receive payments
ADD COLUMN IF NOT EXISTS scheduling_duration_minutes INTEGER DEFAULT 30,  -- Default call duration
ADD COLUMN IF NOT EXISTS scheduling_buffer_minutes INTEGER DEFAULT 15,  -- Buffer between calls
ADD COLUMN IF NOT EXISTS scheduling_advance_notice_hours INTEGER DEFAULT 24,  -- Minimum notice required
ADD COLUMN IF NOT EXISTS scheduling_calendar_sync BOOLEAN DEFAULT true;  -- Sync with Google Calendar

-- Add index for users with scheduling enabled
CREATE INDEX IF NOT EXISTS idx_user_settings_scheduling_enabled 
ON shout_user_settings (scheduling_enabled) 
WHERE scheduling_enabled = true;

-- Update scheduled_calls table to match new structure
ALTER TABLE shout_scheduled_calls 
ADD COLUMN IF NOT EXISTS payment_amount_cents INTEGER,  -- Amount in cents
ADD COLUMN IF NOT EXISTS payment_transaction_hash TEXT,  -- x402 transaction hash
ADD COLUMN IF NOT EXISTS guest_email TEXT,  -- Email for calendar invite (if not a Spritz user)
ADD COLUMN IF NOT EXISTS guest_name TEXT,  -- Name for calendar invite
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';  -- Timezone for the scheduled time

-- Add index for upcoming scheduled calls
CREATE INDEX IF NOT EXISTS idx_scheduled_calls_upcoming 
ON shout_scheduled_calls (recipient_wallet_address, scheduled_at, status) 
WHERE status IN ('pending', 'confirmed') AND scheduled_at > NOW();

COMMENT ON COLUMN shout_user_settings.scheduling_enabled IS 'Whether this user allows others to schedule calls with them';
COMMENT ON COLUMN shout_user_settings.scheduling_price_cents IS 'Price per scheduled call in cents (0 = free)';
COMMENT ON COLUMN shout_user_settings.scheduling_network IS 'Blockchain network for payments: base (mainnet) or base-sepolia (testnet)';
COMMENT ON COLUMN shout_user_settings.scheduling_wallet_address IS 'Wallet address to receive scheduling payments';
COMMENT ON COLUMN shout_user_settings.scheduling_duration_minutes IS 'Default duration for scheduled calls';
COMMENT ON COLUMN shout_user_settings.scheduling_buffer_minutes IS 'Buffer time between scheduled calls';
COMMENT ON COLUMN shout_user_settings.scheduling_advance_notice_hours IS 'Minimum hours of advance notice required for scheduling';


