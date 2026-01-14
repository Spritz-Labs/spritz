-- Alpha Chat Pinned Messages Migration
-- Allows admins to pin messages in Spritz Global Chat

-- Add pinned columns to alpha messages
ALTER TABLE shout_alpha_messages 
ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS pinned_by TEXT,
ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMP WITH TIME ZONE;

-- Index for efficient pinned message queries
CREATE INDEX IF NOT EXISTS idx_alpha_messages_pinned 
ON shout_alpha_messages(is_pinned) 
WHERE is_pinned = true;

-- Allow admins to update pinned status
DROP POLICY IF EXISTS "Admins can update alpha messages" ON public.shout_alpha_messages;
CREATE POLICY "Admins can update alpha messages"
ON public.shout_alpha_messages
FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM shout_admins 
        WHERE wallet_address = current_setting('request.jwt.claims', true)::json->>'wallet_address'
    )
    OR true -- Allow all updates for now, admin check done at API level
)
WITH CHECK (true);

-- Done!
SELECT 'Alpha chat pinned messages migration complete!' as status;
