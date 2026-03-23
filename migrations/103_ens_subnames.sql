-- ENS subdomain support: track which users have claimed username.spritz.eth
ALTER TABLE public.shout_users
    ADD COLUMN IF NOT EXISTS ens_subname_claimed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ens_resolve_address TEXT;

-- ENS config table for admin settings (gateway URL, parent name, signer, etc.)
CREATE TABLE IF NOT EXISTS public.shout_ens_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_name TEXT NOT NULL DEFAULT 'spritz.eth',
    gateway_url TEXT NOT NULL DEFAULT 'https://app.spritz.chat/api/ens/ccip-gateway',
    signer_address TEXT,
    resolver_address TEXT,
    ttl INTEGER NOT NULL DEFAULT 300,
    enabled BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by TEXT
);

ALTER TABLE public.shout_ens_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shout_ens_config FROM anon, authenticated;

-- Seed a default row
INSERT INTO public.shout_ens_config (parent_name, gateway_url, enabled)
VALUES ('spritz.eth', 'https://app.spritz.chat/api/ens/ccip-gateway', false)
ON CONFLICT DO NOTHING;
