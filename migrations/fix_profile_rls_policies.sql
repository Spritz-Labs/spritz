-- Fix RLS Policies for User Profile Tables
-- This migration adds INSERT and UPDATE policies for anon users to allow
-- users to update their own profile data (socials, settings, etc.)
-- 
-- Note: Since we use wallet-based auth (SIWE) rather than Supabase Auth,
-- we cannot use auth.uid() in policies. These policies allow anon users
-- to manage profile records. The actual authentication is handled at the
-- application layer through SIWE sessions.

-- ============================================================================
-- 1. SHOUT_SOCIALS - Allow users to manage their social links
-- ============================================================================

-- Allow anon users to insert their own social links
DROP POLICY IF EXISTS "Anyone can insert socials" ON public.shout_socials;
CREATE POLICY "Anyone can insert socials"
ON public.shout_socials
FOR INSERT
TO anon
WITH CHECK (true);

-- Allow anon users to update their own social links
DROP POLICY IF EXISTS "Anyone can update socials" ON public.shout_socials;
CREATE POLICY "Anyone can update socials"
ON public.shout_socials
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- ============================================================================
-- 2. SHOUT_USER_SETTINGS - Allow users to manage their settings
-- ============================================================================

-- Allow anon users to insert their own settings
DROP POLICY IF EXISTS "Anyone can insert user settings" ON public.shout_user_settings;
CREATE POLICY "Anyone can insert user settings"
ON public.shout_user_settings
FOR INSERT
TO anon
WITH CHECK (true);

-- Allow anon users to update their own settings
DROP POLICY IF EXISTS "Anyone can update user settings" ON public.shout_user_settings;
CREATE POLICY "Anyone can update user settings"
ON public.shout_user_settings
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- Allow anon users to read all user settings (needed for viewing friend profiles, etc.)
DROP POLICY IF EXISTS "Anyone can view all user settings" ON public.shout_user_settings;
CREATE POLICY "Anyone can view all user settings"
ON public.shout_user_settings
FOR SELECT
TO anon
USING (true);

-- ============================================================================
-- 3. SHOUT_USERNAMES - Allow users to manage their usernames
-- Note: The username route uses service role, but adding policies for
-- direct access if needed in the future
-- ============================================================================

-- Allow anon users to insert usernames
DROP POLICY IF EXISTS "Anyone can insert usernames" ON public.shout_usernames;
CREATE POLICY "Anyone can insert usernames"
ON public.shout_usernames
FOR INSERT
TO anon
WITH CHECK (true);

-- Allow anon users to update usernames
DROP POLICY IF EXISTS "Anyone can update usernames" ON public.shout_usernames;
CREATE POLICY "Anyone can update usernames"
ON public.shout_usernames
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- ============================================================================
-- 4. SHOUT_FRIENDS - Allow users to manage their friend relationships
-- ============================================================================

-- Allow anon users to view friends
DROP POLICY IF EXISTS "Anyone can view friends" ON public.shout_friends;
CREATE POLICY "Anyone can view friends"
ON public.shout_friends
FOR SELECT
TO anon
USING (true);

-- Allow anon users to add friends
DROP POLICY IF EXISTS "Anyone can add friends" ON public.shout_friends;
CREATE POLICY "Anyone can add friends"
ON public.shout_friends
FOR INSERT
TO anon
WITH CHECK (true);

-- Allow anon users to remove/update friends
DROP POLICY IF EXISTS "Anyone can update friends" ON public.shout_friends;
CREATE POLICY "Anyone can update friends"
ON public.shout_friends
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- Allow anon users to delete friends
DROP POLICY IF EXISTS "Anyone can delete friends" ON public.shout_friends;
CREATE POLICY "Anyone can delete friends"
ON public.shout_friends
FOR DELETE
TO anon
USING (true);

-- ============================================================================
-- 5. SHOUT_FRIEND_REQUESTS - Allow users to manage friend requests
-- ============================================================================

-- Allow anon users to view friend requests
DROP POLICY IF EXISTS "Anyone can view friend requests" ON public.shout_friend_requests;
CREATE POLICY "Anyone can view friend requests"
ON public.shout_friend_requests
FOR SELECT
TO anon
USING (true);

-- Allow anon users to create friend requests
DROP POLICY IF EXISTS "Anyone can create friend requests" ON public.shout_friend_requests;
CREATE POLICY "Anyone can create friend requests"
ON public.shout_friend_requests
FOR INSERT
TO anon
WITH CHECK (true);

-- Allow anon users to update friend requests (accept/reject)
DROP POLICY IF EXISTS "Anyone can update friend requests" ON public.shout_friend_requests;
CREATE POLICY "Anyone can update friend requests"
ON public.shout_friend_requests
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- Allow anon users to delete friend requests
DROP POLICY IF EXISTS "Anyone can delete friend requests" ON public.shout_friend_requests;
CREATE POLICY "Anyone can delete friend requests"
ON public.shout_friend_requests
FOR DELETE
TO anon
USING (true);

-- ============================================================================
-- 6. SHOUT_CALLS - Allow users to manage their calls
-- ============================================================================

-- Allow anon users to view calls
DROP POLICY IF EXISTS "Anyone can view calls" ON public.shout_calls;
CREATE POLICY "Anyone can view calls"
ON public.shout_calls
FOR SELECT
TO anon
USING (true);

-- Allow anon users to create calls
DROP POLICY IF EXISTS "Anyone can create calls" ON public.shout_calls;
CREATE POLICY "Anyone can create calls"
ON public.shout_calls
FOR INSERT
TO anon
WITH CHECK (true);

-- Allow anon users to update calls
DROP POLICY IF EXISTS "Anyone can update calls" ON public.shout_calls;
CREATE POLICY "Anyone can update calls"
ON public.shout_calls
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- Allow anon users to delete calls
DROP POLICY IF EXISTS "Anyone can delete calls" ON public.shout_calls;
CREATE POLICY "Anyone can delete calls"
ON public.shout_calls
FOR DELETE
TO anon
USING (true);

-- ============================================================================
-- 7. SHOUT_POINTS - Allow users to view their points (read-only via anon)
-- ============================================================================

-- Allow anon users to view points
DROP POLICY IF EXISTS "Anyone can view points" ON public.shout_points;
CREATE POLICY "Anyone can view points"
ON public.shout_points
FOR SELECT
TO anon
USING (true);

-- ============================================================================
-- 8. SHOUT_TYPING_STATUS - Allow users to manage their typing status
-- ============================================================================

-- Enable RLS if not already enabled
ALTER TABLE IF EXISTS public.shout_typing_status ENABLE ROW LEVEL SECURITY;

-- Allow anon users to view typing status
DROP POLICY IF EXISTS "Anyone can view typing status" ON public.shout_typing_status;
CREATE POLICY "Anyone can view typing status"
ON public.shout_typing_status
FOR SELECT
TO anon
USING (true);

-- Allow anon users to insert typing status
DROP POLICY IF EXISTS "Anyone can insert typing status" ON public.shout_typing_status;
CREATE POLICY "Anyone can insert typing status"
ON public.shout_typing_status
FOR INSERT
TO anon
WITH CHECK (true);

-- Allow anon users to update typing status
DROP POLICY IF EXISTS "Anyone can update typing status" ON public.shout_typing_status;
CREATE POLICY "Anyone can update typing status"
ON public.shout_typing_status
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- Allow anon users to delete typing status
DROP POLICY IF EXISTS "Anyone can delete typing status" ON public.shout_typing_status;
CREATE POLICY "Anyone can delete typing status"
ON public.shout_typing_status
FOR DELETE
TO anon
USING (true);

-- Service role access
DROP POLICY IF EXISTS "Service role has full access to typing status" ON public.shout_typing_status;
CREATE POLICY "Service role has full access to typing status"
ON public.shout_typing_status
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================================
-- 9. SHOUT_READ_RECEIPTS - Allow users to manage read receipts
-- ============================================================================

-- Enable RLS if not already enabled
ALTER TABLE IF EXISTS public.shout_read_receipts ENABLE ROW LEVEL SECURITY;

-- Allow anon users to view read receipts
DROP POLICY IF EXISTS "Anyone can view read receipts" ON public.shout_read_receipts;
CREATE POLICY "Anyone can view read receipts"
ON public.shout_read_receipts
FOR SELECT
TO anon
USING (true);

-- Allow anon users to insert read receipts
DROP POLICY IF EXISTS "Anyone can insert read receipts" ON public.shout_read_receipts;
CREATE POLICY "Anyone can insert read receipts"
ON public.shout_read_receipts
FOR INSERT
TO anon
WITH CHECK (true);

-- Allow anon users to update read receipts
DROP POLICY IF EXISTS "Anyone can update read receipts" ON public.shout_read_receipts;
CREATE POLICY "Anyone can update read receipts"
ON public.shout_read_receipts
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- Service role access
DROP POLICY IF EXISTS "Service role has full access to read receipts" ON public.shout_read_receipts;
CREATE POLICY "Service role has full access to read receipts"
ON public.shout_read_receipts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================================
-- 10. SHOUT_MESSAGE_REACTIONS - Allow users to manage message reactions
-- ============================================================================

-- Enable RLS if not already enabled
ALTER TABLE IF EXISTS public.shout_message_reactions ENABLE ROW LEVEL SECURITY;

-- Allow anon users to view message reactions
DROP POLICY IF EXISTS "Anyone can view message reactions" ON public.shout_message_reactions;
CREATE POLICY "Anyone can view message reactions"
ON public.shout_message_reactions
FOR SELECT
TO anon
USING (true);

-- Allow anon users to insert message reactions
DROP POLICY IF EXISTS "Anyone can insert message reactions" ON public.shout_message_reactions;
CREATE POLICY "Anyone can insert message reactions"
ON public.shout_message_reactions
FOR INSERT
TO anon
WITH CHECK (true);

-- Allow anon users to delete message reactions
DROP POLICY IF EXISTS "Anyone can delete message reactions" ON public.shout_message_reactions;
CREATE POLICY "Anyone can delete message reactions"
ON public.shout_message_reactions
FOR DELETE
TO anon
USING (true);

-- Service role access
DROP POLICY IF EXISTS "Service role has full access to message reactions" ON public.shout_message_reactions;
CREATE POLICY "Service role has full access to message reactions"
ON public.shout_message_reactions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================================
-- 11. SHOUT_MUTED_CONVERSATIONS - Allow users to manage muted conversations
-- ============================================================================

-- Enable RLS if not already enabled
ALTER TABLE IF EXISTS public.shout_muted_conversations ENABLE ROW LEVEL SECURITY;

-- Allow anon users to view muted conversations
DROP POLICY IF EXISTS "Anyone can view muted conversations" ON public.shout_muted_conversations;
CREATE POLICY "Anyone can view muted conversations"
ON public.shout_muted_conversations
FOR SELECT
TO anon
USING (true);

-- Allow anon users to insert muted conversations
DROP POLICY IF EXISTS "Anyone can insert muted conversations" ON public.shout_muted_conversations;
CREATE POLICY "Anyone can insert muted conversations"
ON public.shout_muted_conversations
FOR INSERT
TO anon
WITH CHECK (true);

-- Allow anon users to update muted conversations
DROP POLICY IF EXISTS "Anyone can update muted conversations" ON public.shout_muted_conversations;
CREATE POLICY "Anyone can update muted conversations"
ON public.shout_muted_conversations
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- Allow anon users to delete muted conversations
DROP POLICY IF EXISTS "Anyone can delete muted conversations" ON public.shout_muted_conversations;
CREATE POLICY "Anyone can delete muted conversations"
ON public.shout_muted_conversations
FOR DELETE
TO anon
USING (true);

-- Service role access
DROP POLICY IF EXISTS "Service role has full access to muted conversations" ON public.shout_muted_conversations;
CREATE POLICY "Service role has full access to muted conversations"
ON public.shout_muted_conversations
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================================
-- 12. SHOUT_REACTIONS - Allow users to manage reactions (IPFS content reactions)
-- ============================================================================

-- Enable RLS if not already enabled
ALTER TABLE IF EXISTS public.shout_reactions ENABLE ROW LEVEL SECURITY;

-- Allow anon users to view reactions
DROP POLICY IF EXISTS "Anyone can view reactions" ON public.shout_reactions;
CREATE POLICY "Anyone can view reactions"
ON public.shout_reactions
FOR SELECT
TO anon
USING (true);

-- Allow anon users to insert reactions
DROP POLICY IF EXISTS "Anyone can insert reactions" ON public.shout_reactions;
CREATE POLICY "Anyone can insert reactions"
ON public.shout_reactions
FOR INSERT
TO anon
WITH CHECK (true);

-- Allow anon users to delete reactions
DROP POLICY IF EXISTS "Anyone can delete reactions" ON public.shout_reactions;
CREATE POLICY "Anyone can delete reactions"
ON public.shout_reactions
FOR DELETE
TO anon
USING (true);

-- Service role access
DROP POLICY IF EXISTS "Service role has full access to reactions" ON public.shout_reactions;
CREATE POLICY "Service role has full access to reactions"
ON public.shout_reactions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================================
-- 13. SHOUT_LINK_PREVIEWS - Allow reading link previews (cache table)
-- ============================================================================

-- Enable RLS if not already enabled
ALTER TABLE IF EXISTS public.shout_link_previews ENABLE ROW LEVEL SECURITY;

-- Allow anon users to view link previews
DROP POLICY IF EXISTS "Anyone can view link previews" ON public.shout_link_previews;
CREATE POLICY "Anyone can view link previews"
ON public.shout_link_previews
FOR SELECT
TO anon
USING (true);

-- Allow anon users to insert link previews (cache writes)
DROP POLICY IF EXISTS "Anyone can insert link previews" ON public.shout_link_previews;
CREATE POLICY "Anyone can insert link previews"
ON public.shout_link_previews
FOR INSERT
TO anon
WITH CHECK (true);

-- Service role access
DROP POLICY IF EXISTS "Service role has full access to link previews" ON public.shout_link_previews;
CREATE POLICY "Service role has full access to link previews"
ON public.shout_link_previews
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================================
-- 14. SHOUT_GROUP_INVITATIONS - Allow users to manage group invitations
-- ============================================================================

-- Enable RLS if not already enabled
ALTER TABLE IF EXISTS public.shout_group_invitations ENABLE ROW LEVEL SECURITY;

-- Allow anon users to view group invitations
DROP POLICY IF EXISTS "Anyone can view group invitations" ON public.shout_group_invitations;
CREATE POLICY "Anyone can view group invitations"
ON public.shout_group_invitations
FOR SELECT
TO anon
USING (true);

-- Allow anon users to insert group invitations
DROP POLICY IF EXISTS "Anyone can insert group invitations" ON public.shout_group_invitations;
CREATE POLICY "Anyone can insert group invitations"
ON public.shout_group_invitations
FOR INSERT
TO anon
WITH CHECK (true);

-- Allow anon users to update group invitations (accept/reject)
DROP POLICY IF EXISTS "Anyone can update group invitations" ON public.shout_group_invitations;
CREATE POLICY "Anyone can update group invitations"
ON public.shout_group_invitations
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- Allow anon users to delete group invitations
DROP POLICY IF EXISTS "Anyone can delete group invitations" ON public.shout_group_invitations;
CREATE POLICY "Anyone can delete group invitations"
ON public.shout_group_invitations
FOR DELETE
TO anon
USING (true);

-- Service role access
DROP POLICY IF EXISTS "Service role has full access to group invitations" ON public.shout_group_invitations;
CREATE POLICY "Service role has full access to group invitations"
ON public.shout_group_invitations
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================================
-- 15. SHOUT_ALPHA_MEMBERSHIP - Allow users to manage alpha chat membership
-- ============================================================================

-- Enable RLS if not already enabled
ALTER TABLE IF EXISTS public.shout_alpha_membership ENABLE ROW LEVEL SECURITY;

-- Allow anon users to view alpha membership
DROP POLICY IF EXISTS "Anyone can view alpha membership" ON public.shout_alpha_membership;
CREATE POLICY "Anyone can view alpha membership"
ON public.shout_alpha_membership
FOR SELECT
TO anon
USING (true);

-- Allow anon users to insert alpha membership
DROP POLICY IF EXISTS "Anyone can insert alpha membership" ON public.shout_alpha_membership;
CREATE POLICY "Anyone can insert alpha membership"
ON public.shout_alpha_membership
FOR INSERT
TO anon
WITH CHECK (true);

-- Allow anon users to update alpha membership
DROP POLICY IF EXISTS "Anyone can update alpha membership" ON public.shout_alpha_membership;
CREATE POLICY "Anyone can update alpha membership"
ON public.shout_alpha_membership
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- Service role access
DROP POLICY IF EXISTS "Service role has full access to alpha membership" ON public.shout_alpha_membership;
CREATE POLICY "Service role has full access to alpha membership"
ON public.shout_alpha_membership
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================================
-- 16. SHOUT_ALPHA_MESSAGES - Allow users to manage alpha chat messages
-- ============================================================================

-- Enable RLS if not already enabled
ALTER TABLE IF EXISTS public.shout_alpha_messages ENABLE ROW LEVEL SECURITY;

-- Allow anon users to view alpha messages
DROP POLICY IF EXISTS "Anyone can view alpha messages" ON public.shout_alpha_messages;
CREATE POLICY "Anyone can view alpha messages"
ON public.shout_alpha_messages
FOR SELECT
TO anon
USING (true);

-- Allow anon users to insert alpha messages
DROP POLICY IF EXISTS "Anyone can insert alpha messages" ON public.shout_alpha_messages;
CREATE POLICY "Anyone can insert alpha messages"
ON public.shout_alpha_messages
FOR INSERT
TO anon
WITH CHECK (true);

-- Service role access
DROP POLICY IF EXISTS "Service role has full access to alpha messages" ON public.shout_alpha_messages;
CREATE POLICY "Service role has full access to alpha messages"
ON public.shout_alpha_messages
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================================
-- 17. SHOUT_ALPHA_REACTIONS - Allow users to manage alpha chat reactions
-- ============================================================================

-- Enable RLS if not already enabled
ALTER TABLE IF EXISTS public.shout_alpha_reactions ENABLE ROW LEVEL SECURITY;

-- Allow anon users to view alpha reactions
DROP POLICY IF EXISTS "Anyone can view alpha reactions" ON public.shout_alpha_reactions;
CREATE POLICY "Anyone can view alpha reactions"
ON public.shout_alpha_reactions
FOR SELECT
TO anon
USING (true);

-- Allow anon users to insert alpha reactions
DROP POLICY IF EXISTS "Anyone can insert alpha reactions" ON public.shout_alpha_reactions;
CREATE POLICY "Anyone can insert alpha reactions"
ON public.shout_alpha_reactions
FOR INSERT
TO anon
WITH CHECK (true);

-- Allow anon users to delete alpha reactions
DROP POLICY IF EXISTS "Anyone can delete alpha reactions" ON public.shout_alpha_reactions;
CREATE POLICY "Anyone can delete alpha reactions"
ON public.shout_alpha_reactions
FOR DELETE
TO anon
USING (true);

-- Service role access
DROP POLICY IF EXISTS "Service role has full access to alpha reactions" ON public.shout_alpha_reactions;
CREATE POLICY "Service role has full access to alpha reactions"
ON public.shout_alpha_reactions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================================
-- VERIFICATION: List all RLS policies
-- Run this query to verify policies:
-- SELECT tablename, policyname, permissive, roles, cmd, qual, with_check 
-- FROM pg_policies 
-- WHERE tablename LIKE 'shout_%';
-- ============================================================================
