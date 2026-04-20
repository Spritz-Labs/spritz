-- Priority Sessions: record Spritz platform fee (1% of paid bookings)
-- The platform_fee_cents column stores the Spritz take per booking.
-- platform_fee_status tracks settlement: 'pending' → 'settled'.

ALTER TABLE shout_scheduled_calls
  ADD COLUMN IF NOT EXISTS platform_fee_cents      integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_fee_status      text DEFAULT 'pending'
    CHECK (platform_fee_status IN ('pending', 'settled', 'waived')),
  ADD COLUMN IF NOT EXISTS platform_fee_settled_at  timestamptz;

COMMENT ON COLUMN shout_scheduled_calls.platform_fee_cents     IS 'Spritz platform fee in cents (1% of payment_amount_cents for paid sessions)';
COMMENT ON COLUMN shout_scheduled_calls.platform_fee_status    IS 'Fee settlement status: pending (owed), settled (collected), waived (promo/free)';
COMMENT ON COLUMN shout_scheduled_calls.platform_fee_settled_at IS 'Timestamp when the platform fee was settled/collected';

-- Index for admin fee settlement dashboard queries
CREATE INDEX IF NOT EXISTS idx_scheduled_calls_fee_status
  ON shout_scheduled_calls (platform_fee_status)
  WHERE platform_fee_cents > 0;
