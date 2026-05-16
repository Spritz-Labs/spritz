-- Granular notification preferences
ALTER TABLE shout_users ADD COLUMN IF NOT EXISTS notification_quiet_start smallint DEFAULT NULL;
ALTER TABLE shout_users ADD COLUMN IF NOT EXISTS notification_quiet_end smallint DEFAULT NULL;
ALTER TABLE shout_users ADD COLUMN IF NOT EXISTS notify_dms boolean DEFAULT true;
ALTER TABLE shout_users ADD COLUMN IF NOT EXISTS notify_groups boolean DEFAULT true;
ALTER TABLE shout_users ADD COLUMN IF NOT EXISTS notify_channels boolean DEFAULT true;
ALTER TABLE shout_users ADD COLUMN IF NOT EXISTS notify_calls boolean DEFAULT true;

COMMENT ON COLUMN shout_users.notification_quiet_start IS 'Hour (0-23) when quiet hours begin. NULL = disabled.';
COMMENT ON COLUMN shout_users.notification_quiet_end IS 'Hour (0-23) when quiet hours end. NULL = disabled.';
COMMENT ON COLUMN shout_users.notify_dms IS 'Send push notifications for direct messages';
COMMENT ON COLUMN shout_users.notify_groups IS 'Send push notifications for group messages';
COMMENT ON COLUMN shout_users.notify_channels IS 'Send push notifications for channel messages';
COMMENT ON COLUMN shout_users.notify_calls IS 'Send push notifications for incoming calls';
