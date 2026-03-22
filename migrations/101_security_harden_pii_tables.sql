-- ================================================================
-- SECURITY HARDENING: Restrict PII access from anon/authenticated
-- Applied: 2026-03-02
-- ================================================================

-- ----------------------------------------------------------------
-- 1. passkey_email_recovery: Enable RLS + service_role only
--    Contains: email, user_address, ip_address, recovery code
--    Previously: RLS DISABLED, full grants to anon
-- ----------------------------------------------------------------
ALTER TABLE public.passkey_email_recovery ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to passkey_email_recovery" ON public.passkey_email_recovery;
CREATE POLICY "Service role full access to passkey_email_recovery"
  ON public.passkey_email_recovery
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.passkey_email_recovery FROM anon, authenticated;

-- ----------------------------------------------------------------
-- 2. shout_email_verification: service_role only
--    Contains: email, verification code, wallet_address
--    Previously: public SELECT/INSERT/UPDATE USING (true)
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own email verification" ON public.shout_email_verification;
DROP POLICY IF EXISTS "Users can insert email verification" ON public.shout_email_verification;
DROP POLICY IF EXISTS "Users can update email verification" ON public.shout_email_verification;

DROP POLICY IF EXISTS "Service role full access to email verification" ON public.shout_email_verification;
CREATE POLICY "Service role full access to email verification"
  ON public.shout_email_verification
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.shout_email_verification FROM anon, authenticated;

-- ----------------------------------------------------------------
-- 3. shout_users: Column-level SELECT restriction
--    Hides from anon: email, email_verified, email_verified_at,
--      subscription_stripe_id, is_banned, ban_reason, notes,
--      invite_code_used, referred_by
-- ----------------------------------------------------------------
REVOKE SELECT ON public.shout_users FROM anon, authenticated;

GRANT SELECT (
    id, wallet_address, ens_name, avatar_url, display_name,
    created_at, updated_at, username, friends_count, messages_sent,
    voice_minutes, video_minutes, groups_count, total_calls,
    points, points_claimed, invite_count, daily_points_claimed_at,
    beta_access, beta_access_applied, beta_access_applied_at,
    subscription_tier, subscription_expires_at, subscription_started_at,
    permanent_room_id, streams_created, streams_started, streams_ended,
    streaming_minutes, streams_viewed, stream_viewing_minutes,
    rooms_created, rooms_joined, schedules_created, schedules_joined,
    channels_joined, smart_wallet_address, welcome_shown_at,
    login_count, first_login, last_login, wallet_type, chain,
    email_updates_opt_in
) ON public.shout_users TO anon, authenticated;

-- ----------------------------------------------------------------
-- 4. shout_phone_numbers: Revoke anon access entirely
--    Previously: anon SELECT WHERE verified = true
--    Phone status now served by /api/phone/status (service_role)
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Anon can read verified phone numbers" ON public.shout_phone_numbers;

REVOKE ALL ON public.shout_phone_numbers FROM anon, authenticated;

-- ----------------------------------------------------------------
-- 5. shout_user_settings: Column-level SELECT restriction
--    Hides from anon: messaging_private_key_encrypted,
--      messaging_backup_encrypted, messaging_backup_salt
--    Encrypted key material now served by
--    /api/user/messaging-keys (service_role, auth required)
-- ----------------------------------------------------------------
REVOKE SELECT ON public.shout_user_settings FROM anon, authenticated;

GRANT SELECT (
    id, wallet_address, status_emoji, status_text, is_dnd, sound_enabled,
    created_at, updated_at, decentralized_calls, last_seen,
    scheduling_enabled, scheduling_price_cents, scheduling_network,
    scheduling_wallet_address,
    scheduling_duration_minutes, scheduling_buffer_minutes,
    scheduling_advance_notice_hours, scheduling_calendar_sync,
    scheduling_slug, scheduling_free_enabled, scheduling_paid_enabled,
    scheduling_bio, scheduling_title, scheduling_free_duration_minutes,
    scheduling_paid_duration_minutes, public_landing_enabled, public_bio,
    custom_avatar_url, use_custom_avatar,
    messaging_public_key, messaging_key_source, messaging_backup_enabled
) ON public.shout_user_settings TO anon, authenticated;
