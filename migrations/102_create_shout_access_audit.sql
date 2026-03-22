CREATE TABLE IF NOT EXISTS public.shout_access_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_address TEXT,
    action TEXT NOT NULL,
    resource_table TEXT,
    resource_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.shout_access_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.shout_access_audit FROM anon, authenticated;
GRANT INSERT ON public.shout_access_audit TO authenticated;
GRANT SELECT ON public.shout_access_audit TO authenticated;

CREATE INDEX idx_access_audit_user ON public.shout_access_audit (user_address);
CREATE INDEX idx_access_audit_action ON public.shout_access_audit (action);
CREATE INDEX idx_access_audit_created ON public.shout_access_audit (created_at DESC);
