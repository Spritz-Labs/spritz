-- Re-engagement lifecycle tracking columns for shout_users
-- Supports 7-day push dormancy triggers and 30-day email lifecycle

ALTER TABLE shout_users ADD COLUMN IF NOT EXISTS last_reengagement_push_at timestamptz;
ALTER TABLE shout_users ADD COLUMN IF NOT EXISTS reengagement_push_dismissals integer DEFAULT 0;
ALTER TABLE shout_users ADD COLUMN IF NOT EXISTS last_lifecycle_email_at timestamptz;
ALTER TABLE shout_users ADD COLUMN IF NOT EXISTS lifecycle_email_stage text DEFAULT NULL;
-- Tracks days since the user was last active for re-entry UX
ALTER TABLE shout_users ADD COLUMN IF NOT EXISTS last_active_at timestamptz;

COMMENT ON COLUMN shout_users.last_reengagement_push_at IS 'Timestamp of last dormancy push notification sent';
COMMENT ON COLUMN shout_users.reengagement_push_dismissals IS 'Consecutive push dismissals (reset on app open). Hard-stop at 2.';
COMMENT ON COLUMN shout_users.last_lifecycle_email_at IS 'Timestamp of last lifecycle email sent (30d/60d)';
COMMENT ON COLUMN shout_users.lifecycle_email_stage IS 'Current stage: NULL (none), 30d, 60d, opted_out';
COMMENT ON COLUMN shout_users.last_active_at IS 'Last time user sent a message or performed an action (more granular than last_login)';
