-- Deferred inbox messages (recipients may not be Spritz users yet)
-- Applied via Supabase MCP to project; kept in repo for version control.

CREATE TABLE IF NOT EXISTS public.shout_inbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_address TEXT NOT NULL,
    recipient_identifier TEXT NOT NULL,
    recipient_address TEXT,
    content TEXT NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'text',
    metadata JSONB,
    claimed BOOLEAN NOT NULL DEFAULT false,
    claimed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    sender_display_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_shout_inbox_recipient_address_unclaimed
    ON public.shout_inbox (recipient_address)
    WHERE NOT claimed;

CREATE INDEX IF NOT EXISTS idx_shout_inbox_recipient_identifier_unclaimed
    ON public.shout_inbox (recipient_identifier)
    WHERE NOT claimed;

CREATE INDEX IF NOT EXISTS idx_shout_inbox_created_at
    ON public.shout_inbox (created_at DESC);

ALTER TABLE public.shout_inbox ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.shout_inbox IS 'Deferred messages to any SNS/ENS/address; API uses service role.';
