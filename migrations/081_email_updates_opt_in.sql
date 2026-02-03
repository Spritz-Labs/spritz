-- Add email updates opt-in to shout_users (for product/news emails)
-- When a user verifies their email, we default this to true; they can toggle in Settings.

ALTER TABLE shout_users
ADD COLUMN IF NOT EXISTS email_updates_opt_in BOOLEAN DEFAULT false;

COMMENT ON COLUMN shout_users.email_updates_opt_in IS 'User opted in to receive product updates and news by email. Default true when they verify email; can toggle in Settings.';
